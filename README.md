# Rock Paper Scissors Fitness

A tiny two-player realtime Rock Paper Scissors web app built entirely on Cloudflare.

## Stack

Cloudflare Workers
Cloudflare Durable Objects
Cloudflare Static Assets
Vanilla HTML, CSS, and JavaScript

No Supabase, Firebase, login system, or external database is required.

## What it does

1. Player 1 enters a name and creates a room.
2. The app generates a 6-character room code.
3. Player 2 enters their name and room code.
4. Each player secretly picks Rock, Paper, or Scissors.
5. Each player locks their choice.
6. When both choices are locked, both screens show a 3, 2, 1 countdown.
7. The choices reveal together and the winner is shown.
8. Either player can start the next round.

## Deploy with GitHub + Cloudflare

### 1. Put this repo on GitHub

Create a new GitHub repository and upload all files from this folder.

### 2. Create a Cloudflare Worker

In Cloudflare Dashboard, go to Workers & Pages and create a Worker from your Git repository.

Cloudflare should detect the `wrangler.toml` file.

Build command can be left empty.

Deploy command:

```
npx wrangler deploy
```

If Cloudflare asks for a Node version, use Node 20 or newer.

### 3. Durable Object migration

The included `wrangler.toml` already declares the Durable Object and SQLite migration:

```
[[migrations]]
tag = "v1"
new_sqlite_classes = ["GameRoom"]
```

The first `wrangler deploy` applies the migration.

### 4. Open the Worker URL

After deployment Cloudflare will give you a `workers.dev` URL. Open it on two phones or browser windows.

Create a room on one device, join from the other, and play.

## Local development

Install Wrangler:

```
npm install -g wrangler
```

Then run:

```
wrangler dev
```

Open the local URL shown in the terminal.

## Notes

Rooms currently persist in Durable Object storage. A future version can add automatic room expiration, fitness movement selection, and 20 or 40 second exercise timers.
