export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.data = {
      roomCode: null,
      players: {},
      round: 1,
      status: "waiting",
      result: null,
    };
  }

  async load() {
    const saved = await this.state.storage.get("data");
    if (saved) this.data = saved;
  }

  async save() {
    await this.state.storage.put("data", this.data);
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.send(JSON.stringify({ type: "state", data: this.publicState() }));
      server.addEventListener("message", async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleMessage(server, msg);
        } catch {
          server.send(JSON.stringify({ type: "error", message: "Invalid message." }));
        }
      });
      const cleanup = () => this.sessions.delete(server);
      server.addEventListener("close", cleanup);
      server.addEventListener("error", cleanup);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/init") && request.method === "POST") {
      const body = await request.json();
      this.data.roomCode = body.roomCode;
      await this.save();
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }

  publicState() {
    const players = Object.values(this.data.players).map((p) => ({
      id: p.id,
      name: p.name,
      locked: !!p.locked,
      choice: this.data.status === "revealed" ? p.choice : null,
    }));
    return {
      roomCode: this.data.roomCode,
      players,
      round: this.data.round,
      status: this.data.status,
      result: this.data.result,
    };
  }

  broadcast() {
    const payload = JSON.stringify({ type: "state", data: this.publicState() });
    for (const ws of this.sessions) {
      try { ws.send(payload); } catch {}
    }
  }

  async handleMessage(ws, msg) {
    if (msg.type === "join") {
      if (!msg.playerId || !msg.name) return;
      const ids = Object.keys(this.data.players);
      if (!this.data.players[msg.playerId] && ids.length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "This room already has two players." }));
        return;
      }
      this.data.players[msg.playerId] = {
        id: msg.playerId,
        name: String(msg.name).slice(0, 24),
        choice: null,
        locked: false,
      };
      this.data.status = Object.keys(this.data.players).length === 2 ? "choosing" : "waiting";
      await this.save();
      this.broadcast();
      return;
    }

    if (msg.type === "choose") {
      const p = this.data.players[msg.playerId];
      if (!p || p.locked || !["rock","paper","scissors"].includes(msg.choice)) return;
      p.choice = msg.choice;
      await this.save();
      this.broadcast();
      return;
    }

    if (msg.type === "lock") {
      const p = this.data.players[msg.playerId];
      if (!p || !p.choice) return;
      p.locked = true;
      const players = Object.values(this.data.players);
      if (players.length === 2 && players.every((x) => x.locked)) {
        this.data.status = "countdown";
        await this.save();
        this.broadcast();
        setTimeout(async () => {
          const [a,b] = Object.values(this.data.players);
          this.data.result = determineWinner(a,b);
          this.data.status = "revealed";
          await this.save();
          this.broadcast();
        }, 3200);
      } else {
        await this.save();
        this.broadcast();
      }
      return;
    }

    if (msg.type === "reset") {
      for (const p of Object.values(this.data.players)) {
        p.choice = null;
        p.locked = false;
      }
      this.data.round += 1;
      this.data.result = null;
      this.data.status = Object.keys(this.data.players).length === 2 ? "choosing" : "waiting";
      await this.save();
      this.broadcast();
    }
  }
}

function determineWinner(a,b) {
  if (a.choice === b.choice) {
    return { type: "tie", message: "It’s a tie!", winnerId: null };
  }
  const wins = { rock: "scissors", paper: "rock", scissors: "paper" };
  const winner = wins[a.choice] === b.choice ? a : b;
  const loser = winner.id === a.id ? b : a;
  return {
    type: "win",
    winnerId: winner.id,
    winnerName: winner.name,
    loserName: loser.name,
    message: `${label(winner.choice)} beats ${label(loser.choice)}`,
  };
}
function label(v){ return v.charAt(0).toUpperCase()+v.slice(1); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create" && request.method === "POST") {
      const roomCode = makeCode();
      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      await stub.fetch(new Request(`https://room/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode }),
      }));
      return Response.json({ roomCode });
    }

    if (url.pathname.startsWith("/api/room/") && request.headers.get("Upgrade") === "websocket") {
      const code = url.pathname.split("/").pop().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Response("Bad room code", { status: 400 });
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  crypto.getRandomValues(new Uint32Array(6)).forEach((n) => out += chars[n % chars.length]);
  return out;
}
