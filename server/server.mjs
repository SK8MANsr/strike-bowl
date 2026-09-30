import { readBackendContract } from './backend-contract.mjs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { createRequestDatabase, databaseStream, DATABASE_CONCURRENCY } from './request-database.mjs';
import { previousSubmission, assertClientRules, assertRunRules, assertDatabaseEnvironment, assertDatabaseReady, databaseName, PROTOCOL_VERSION, SCHEMA_VERSION } from './deployment-contract.mjs';
import { validateSubmission, cleanDisplayName } from './validate.mjs';

// This server belongs to Strike Bowl, never to Addon Server.
const backendContract = readBackendContract(fileURLToPath(new URL('../', import.meta.url)), { required: false })?.value
  ?? readBackendContract(process.cwd(), { required: true }).value;
if (backendContract.api.protocolVersion !== PROTOCOL_VERSION || backendContract.database.schemaVersion !== SCHEMA_VERSION || backendContract.deploy.healthPath !== '/api/leaderboards/v1/health') throw new Error('backend_contract_incompatible');
const namespace = 'production';
const readonly = process.env.GAME_LEADERBOARD_READ_ONLY === '1';
if (!process.env.DATABASE_URL) throw new Error('Project DATABASE_URL is required');
databaseName(process.env.DATABASE_URL);
const pool = mysql.createPool({ uri: process.env.DATABASE_URL, stream: databaseStream(process.env.DATABASE_URL), connectionLimit: DATABASE_CONCURRENCY, waitForConnections: false, connectTimeout: 3000, timezone: 'Z', dateStrings: true });
const db = createRequestDatabase(pool);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const uuidPattern = /^[0-9a-f-]{36}$/;
const prefix = '/api/leaderboards/v1';
const send = (res, status, data) => {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};
async function rateLimit(key, maximum) {
  const bucket = digest(key);
  const window = Math.floor(Date.now() / 60_000);
  const count = await db.transaction(async (conn) => {
    await conn.execute('INSERT IGNORE INTO game_lb_rate_limits (namespace,bucket_hash,window_start,request_count) VALUES (?, ?, ?, 0)', [namespace, bucket, window]);
    const [[row]] = await conn.execute('SELECT window_start, request_count FROM game_lb_rate_limits WHERE namespace=? AND bucket_hash=? FOR UPDATE', [namespace, bucket]);
    const next = Number(row.window_start) === window ? Math.min(Number(row.request_count) + 1, 4294967295) : 1;
    await conn.execute('UPDATE game_lb_rate_limits SET window_start=?, request_count=? WHERE namespace=? AND bucket_hash=?', [window, next, namespace, bucket]);
    return next;
  });
  if (count > maximum) fail(429, 'rate_limited');
}
async function body(req, keys) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'json_required');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2048) fail(413, 'body_too_large');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'invalid_json'); }
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some((key) => !keys.includes(key))) fail(400, 'invalid_fields');
  return value;
}
async function identity(req, required = true) {
  const auth = req.headers.authorization || '';
  if (!auth && !required) return null;
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth)) {
    if (!required) return null;
    fail(401, 'guest_session_required');
  }
  const [[player]] = await db.execute('SELECT id, display_name FROM game_lb_players WHERE namespace=? AND token_hash=? AND expires_at>UTC_TIMESTAMP(3)', [namespace, digest(auth.slice(7))]);
  if (!player) {
    if (!required) return null;
    fail(401, 'guest_session_expired');
  }
  await rateLimit(`player:${player.id}`, 120);
  return player;
}
async function board(conn, id) {
  const [[value]] = await conn.execute('SELECT * FROM game_lb_boards WHERE namespace=? AND id=?', [namespace, id]);
  if (!value) fail(404, 'board_not_found');
  if (!['asc', 'desc'].includes(value.direction) || !value.rules_version || Number(value.min_score) < -1e9 || Number(value.max_score) > 1e9 || Number(value.min_score) > Number(value.max_score)) fail(503, 'board_configuration_invalid');
  return value;
}
// "Today" is the UTC day, matching the client's daily-challenge seed.
const TODAY_BEST = `SELECT r.player_id, MAX(r.score) AS best, MIN(r.submitted_at) AS first_at
  FROM game_lb_runs r WHERE r.namespace=? AND r.board_id=? AND r.submitted_at>=UTC_DATE() AND r.score IS NOT NULL GROUP BY r.player_id`;
/** Where a score would place against every *other* player, all-time and today. */
async function standing(boardId, rules, score, playerId) {
  const desc = rules.direction === 'desc';
  const better = desc ? '>' : '<';
  const worse = desc ? '<' : '>';
  const me = playerId ?? '';
  const [[all]] = await db.execute(`SELECT COUNT(*) AS total, COALESCE(SUM(score${better}?),0) AS above, COALESCE(SUM(score${worse}?),0) AS below FROM game_lb_best WHERE namespace=? AND board_id=? AND player_id<>?`, [score, score, namespace, boardId, me]);
  const [[day]] = await db.execute(`SELECT COUNT(*) AS total, COALESCE(SUM(t.best${better}?),0) AS above, COALESCE(SUM(t.best${worse}?),0) AS below FROM (${TODAY_BEST}) t WHERE t.player_id<>?`, [score, score, namespace, boardId, me]);
  const shape = (row) => {
    const total = Number(row.total);
    return { rank: Number(row.above) + 1, players: total + 1, beatPct: total > 0 ? Math.round((Number(row.below) / total) * 100) : 100 };
  };
  return { allTime: shape(all), today: shape(day) };
}
async function listBoard(boardId, rules, period, limit, player) {
  const order = rules.direction === 'desc' ? 'DESC' : 'ASC';
  if (period === 'all') {
    const [entries] = await db.query('SELECT b.player_id AS playerId,p.display_name AS displayName,b.score,b.achieved_at AS achievedAt FROM game_lb_best b JOIN game_lb_players p ON p.namespace=b.namespace AND p.id=b.player_id WHERE b.namespace=? AND b.board_id=? ORDER BY b.rank_value,b.achieved_at,b.player_id LIMIT ?', [namespace, boardId, limit]);
    const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM game_lb_best WHERE namespace=? AND board_id=?', [namespace, boardId]);
    let myRank = null;
    if (player) {
      const [[own]] = await db.execute('SELECT * FROM game_lb_best WHERE namespace=? AND board_id=? AND player_id=?', [namespace, boardId, player.id]);
      if (own) {
        const [[rank]] = await db.execute('SELECT COUNT(*)+1 AS ordinal FROM game_lb_best WHERE namespace=? AND board_id=? AND (rank_value<? OR (rank_value=? AND (achieved_at<? OR (achieved_at=? AND player_id<?))))', [namespace, boardId, own.rank_value, own.rank_value, own.achieved_at, own.achieved_at, player.id]);
        myRank = { rank: Number(rank.ordinal), score: Number(own.score) };
      }
    }
    return { entries, players: Number(count.n), myRank };
  }
  const [entries] = await db.query(`SELECT t.player_id AS playerId,p.display_name AS displayName,t.best AS score,t.first_at AS achievedAt FROM (${TODAY_BEST}) t JOIN game_lb_players p ON p.namespace=? AND p.id=t.player_id ORDER BY t.best ${order},t.first_at,t.player_id LIMIT ?`, [namespace, boardId, namespace, limit]);
  const [[count]] = await db.execute(`SELECT COUNT(*) AS n FROM (${TODAY_BEST}) t`, [namespace, boardId]);
  let myRank = null;
  if (player) {
    const [[own]] = await db.execute(`SELECT t.best, t.first_at FROM (${TODAY_BEST}) t WHERE t.player_id=?`, [namespace, boardId, player.id]);
    if (own) {
      const cmp = order === 'DESC' ? '>' : '<';
      const [[rank]] = await db.execute(`SELECT COUNT(*)+1 AS ordinal FROM (${TODAY_BEST}) t WHERE t.best${cmp}? OR (t.best=? AND (t.first_at<? OR (t.first_at=? AND t.player_id<?)))`, [namespace, boardId, own.best, own.best, own.first_at, own.first_at, player.id]);
      myRank = { rank: Number(rank.ordinal), score: Number(own.best) };
    }
  }
  return { entries, players: Number(count.n), myRank };
}
async function handle(req, res) {
  const url = new URL(req.url, 'http://game-api');
  if (!url.pathname.startsWith(`${prefix}/`)) fail(404, 'not_found');
  if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'cross_origin_request');
  if (url.pathname === `${prefix}/health` && req.method === 'GET') {
    await assertDatabaseReady(db, namespace, backendContract);
    await db.execute('SELECT rolls_json FROM game_lb_runs LIMIT 0');
    return send(res, 200, { status: 'ok', namespace, readonly, protocolVersion: PROTOCOL_VERSION, schemaVersion: SCHEMA_VERSION });
  }
  await assertDatabaseEnvironment(db, namespace);
  if (readonly && req.method !== 'GET') fail(403, 'leaderboard_read_only');
  // Socket peers are ingress proxies, not players. Anonymous issuance has an
  // explicit shared service budget; authenticated traffic has its own player quota.
  if (req.method === 'POST' && url.pathname === `${prefix}/guests`) {
    await rateLimit('global:guests', 300);
    const data = await body(req, ['displayName']);
    const name = cleanDisplayName(data.displayName);
    if (!name) fail(400, 'invalid_display_name');
    const token = randomBytes(32).toString('base64url');
    const playerId = randomUUID();
    await db.execute('INSERT INTO game_lb_players (namespace,id,display_name,token_hash,expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))', [namespace, playerId, name, digest(token)]);
    return send(res, 201, { playerId, token, displayName: name, expiresInSeconds: 2592000 });
  }
  if (req.method === 'PATCH' && url.pathname === `${prefix}/guests/me`) {
    const player = await identity(req);
    const data = await body(req, ['displayName']);
    const name = cleanDisplayName(data.displayName);
    if (!name) fail(400, 'invalid_display_name');
    await db.execute('UPDATE game_lb_players SET display_name=?, expires_at=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY) WHERE namespace=? AND id=?', [name, namespace, player.id]);
    return send(res, 200, { playerId: player.id, displayName: name });
  }
  const route = url.pathname.slice(prefix.length).split('/').filter(Boolean);
  if (route[0] === 'boards' && idPattern.test(route[1] || '')) {
    const boardId = route[1];
    if (req.method === 'GET' && route.length === 2) {
      const rules = await board(db, boardId);
      const limit = Number(url.searchParams.get('limit') || 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, 'invalid_limit');
      const period = url.searchParams.get('period') || 'all';
      if (!['all', 'today'].includes(period)) fail(400, 'invalid_period');
      const player = await identity(req, false);
      const { entries, players, myRank } = await listBoard(boardId, rules, period, limit, player);
      return send(res, 200, { namespace, boardId, period, players, rulesVersion: rules.rules_version, trust: 'server_recomputed', entries: entries.map((e, i) => ({ ...e, score: Number(e.score), rank: i + 1, isMe: !!player && e.playerId === player.id })), myRank });
    }
    if (req.method === 'GET' && route.length === 3 && route[2] === 'standing') {
      const rules = await board(db, boardId);
      const score = Number(url.searchParams.get('score'));
      if (!Number.isSafeInteger(score) || score < Number(rules.min_score) || score > Number(rules.max_score)) fail(400, 'invalid_score');
      const player = await identity(req, false);
      return send(res, 200, { boardId, score, ...(await standing(boardId, rules, score, player?.id)) });
    }
    if (req.method === 'POST' && route.length === 3 && route[2] === 'runs') {
      const player = await identity(req);
      const data = await body(req, ['releaseSha', 'protocolVersion', 'rulesVersion', 'day']);
      if (data.day !== new Date().toISOString().slice(0, 10)) fail(409, 'daily_lane_changed');
      if (data.releaseSha !== undefined && (typeof data.releaseSha !== 'string' || !/^[a-f0-9]{7,64}$/.test(data.releaseSha))) fail(400, 'invalid_release_sha');
      const rules = await board(db, boardId);
      if (!rules.open) fail(409, 'board_closed');
      assertClientRules(data, rules);
      const runId = randomUUID();
      await db.execute('INSERT INTO game_lb_runs (namespace,id,player_id,board_id,issued_at,expires_at,release_sha,rules_version,protocol_version) VALUES (?,?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE),?,?,?)', [namespace, runId, player.id, boardId, data.releaseSha ?? null, rules.rules_version, PROTOCOL_VERSION]);
      return send(res, 201, { runId, expiresInSeconds: 1800, rulesVersion: rules.rules_version, protocolVersion: PROTOCOL_VERSION });
    }
  }
  if (req.method === 'PUT' && route.length === 2 && route[0] === 'runs' && uuidPattern.test(route[1])) {
    const player = await identity(req);
    const data = await body(req, ['score', 'durationMs', 'rolls']);
    // Gameplay-specific check: the score must be exactly what the roll sequence scores under
    // 5-frame bowling rules, with a plausible amount of real rolling time per ball.
    const verdict = validateSubmission(data);
    if (!verdict.ok) fail(422, verdict.code);
    const rollsJson = JSON.stringify(data.rolls);
    const submissionHash = digest(JSON.stringify([data.score, data.durationMs, data.rolls]));
    const receipt = await db.transaction(async (conn) => {
      // A player-level lock serializes simultaneous runs before any best row exists.
      await conn.execute('SELECT id FROM game_lb_players WHERE namespace=? AND id=? FOR UPDATE', [namespace, player.id]);
      const [[run]] = await conn.execute('SELECT *, expires_at<UTC_TIMESTAMP(3) AS expired, TIMESTAMPDIFF(MICROSECOND,issued_at,UTC_TIMESTAMP(3))/1000 AS elapsed FROM game_lb_runs WHERE namespace=? AND id=? AND player_id=? FOR UPDATE', [namespace, route[1], player.id]);
      const previous = previousSubmission(run, namespace, player.id, submissionHash);
      if (previous) return previous;
      const rules = await board(conn, run.board_id);
      if (String(run.issued_at).slice(0, 10) !== new Date().toISOString().slice(0, 10)) fail(409, 'daily_lane_changed');
      if (!rules.open) fail(409, 'board_closed');
      assertRunRules(run, rules);
      if (data.score < Number(rules.min_score) || data.score > Number(rules.max_score) || data.durationMs < Number(rules.min_duration_ms) || data.durationMs > Number(rules.max_duration_ms) || data.durationMs > Number(run.elapsed) + 5000) fail(422, 'score_outside_rules');
      // The server clock must also have seen enough time pass for this many balls.
      if (Number(run.elapsed) < verdict.minDurationMs) fail(422, 'run_too_fast');
      const rankValue = rules.direction === 'desc' ? -data.score : data.score;
      const [[best]] = await conn.execute('SELECT rank_value FROM game_lb_best WHERE namespace=? AND board_id=? AND player_id=? FOR UPDATE', [namespace, run.board_id, player.id]);
      let improved = false;
      if (!best) {
        improved = true;
        await conn.execute('INSERT INTO game_lb_best (namespace,board_id,player_id,score,rank_value,achieved_at,run_id) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3),?)', [namespace, run.board_id, player.id, data.score, rankValue, run.id]);
      } else if (rankValue < Number(best.rank_value)) {
        improved = true;
        await conn.execute('UPDATE game_lb_best SET score=?,rank_value=?,achieved_at=UTC_TIMESTAMP(3),run_id=? WHERE namespace=? AND board_id=? AND player_id=?', [data.score, rankValue, run.id, namespace, run.board_id, player.id]);
      }
      await conn.execute('UPDATE game_lb_runs SET score=?,duration_ms=?,rolls_json=?,submission_hash=?,submitted_at=UTC_TIMESTAMP(3) WHERE namespace=? AND id=?', [data.score, data.durationMs, rollsJson, submissionHash, namespace, run.id]);
      return { runId: run.id, score: data.score, accepted: true, improved, trust: 'server_recomputed' };
    });
    return send(res, 200, receipt);
  }
  fail(404, 'not_found');
}
const server = http.createServer((req, res) => {
  db.run(req, res, () => handle(req, res)).catch((error) => {
    if (res.destroyed || res.writableEnded) return;
    if (!error.status) console.error(error);
    send(res, error.status || 503, { error: error.code && error.status ? error.code : 'leaderboard_unavailable' });
    // Stop a slow unfinished upload after returning the bounded failure response.
    if (!req.complete) res.once('finish', () => req.destroy());
  });
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0', () => {
  const address = server.address();
  if (typeof address === 'object') process.send?.({ type: 'ready', port: address.port });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => pool.end().finally(() => process.exit(0))));
