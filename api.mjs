// Crown the Game API as a Netlify Function. Storage: Netlify Blobs. Email: Resend.
// Environment variables (Netlify > Site configuration > Environment variables):
//   RESEND_API_KEY, MAIL_FROM (e.g. "Crown the Game <no-reply@crownthegame.com>"), ADMIN_KEY (a long random string)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const BANK = [["In what year did Atari release Pong in arcades?",["1972","1978","1969","1981"],0],["Which company created the NES in the West, known as the Famicom in Japan?",["Sega","Nintendo","Atari","Sony"],1],["Which company developed the original Pac-Man?",["Namco","Taito","Capcom","Konami"],0],["In what year did Sonic the Hedgehog debut on the Sega Genesis?",["1989","1993","1991","1995"],2],["In which game did Mario first appear?",["Mario Bros.","Donkey Kong","Super Mario Bros.","Punch-Out!!"],1],["Tetris was created by Alexey Pajitnov in which country?",["Japan","United States","Germany","Soviet Union"],3],["Which infamous Atari 2600 game is blamed for worsening the 1983 video game crash?",["Pac-Man","E.T. the Extra-Terrestrial","Combat","Adventure"],1],["In what year did Valve launch the Steam platform?",["2003","1999","2007","2010"],0],["Which studio developed Doom, released in 1993?",["Epic Games","3D Realms","Id Software","Valve"],2],["Counter-Strike began life as a mod for which game?",["Quake","Half-Life","Unreal Tournament","Doom"],1],["Which console was the best-selling of all time, with over 150 million units?",["PlayStation 2","Nintendo DS","Wii","Game Boy"],0],["What was Sega's final home console?",["Saturn","Game Gear","Dreamcast","Master System"],2],["In what year did the original Xbox launch?",["1999","2001","2003","2005"],1],["Which handheld launched in 1989 and came bundled with Tetris?",["Atari Lynx","Game Gear","Game Boy","Neo Geo Pocket"],2],["Which game launched alongside the original Xbox and became its flagship franchise?",["Gears of War","Halo: Combat Evolved","Fable","Forza"],1],["Square's Final Fantasy got its name because the studio thought it might be what?",["Its best game","Its last game","Its cheapest game","Its longest game"],1],["Nintendo was founded in 1889 as a company that made what?",["Toys","Pottery","Playing cards","Radios"],2],["Who created Metal Gear and later Death Stranding?",["Shigeru Miyamoto","Hideo Kojima","Yu Suzuki","Hironobu Sakaguchi"],1],["Which Sega mascot came before Sonic as the company's mascot?",["Alex Kidd","Ristar","Vectorman","Ecco"],0],["Which 1978 arcade shooter was made by Taito?",["Galaga","Asteroids","Space Invaders","Defender"],2],["Which controversial 1992 fighting game helped lead to the creation of the ESRB?",["Street Fighter II","Mortal Kombat","Virtua Fighter","Tekken"],1],["Which heroine starred in the 1996 game Tomb Raider?",["Samus Aran","Lara Croft","Chun-Li","Jill Valentine"],1],["In what year did World of Warcraft launch?",["2001","2006","2004","2008"],2],["Which console launched in 2017 as a hybrid home and handheld system?",["Wii U","Nintendo Switch","Steam Deck","PS Vita"],1],["Which 1977 console popularized cartridge-based home gaming?",["Atari 2600","Intellivision","ColecoVision","Magnavox Odyssey"],0],["Which Nintendo console, launched in 2006, popularized motion controls?",["GameCube","Wii","DS","Switch"],1],["Which 2001 PS2 hit moved the Grand Theft Auto series into 3D?",["Grand Theft Auto III","Vice City","San Andreas","Grand Theft Auto 2"],0],["Which game was Nintendo's famous early 3D platformer launched with the Nintendo 64?",["Banjo-Kazooie","Super Mario 64","Crash Bandicoot","Spyro"],1],["Street Fighter II, the game that sparked the fighting game boom, arrived in which year?",["1987","1991","1995","1989"],1],["In what year was the first Legend of Zelda released in Japan?",["1986","1983","1990","1988"],0],["In what year did the original PlayStation launch in Japan?",["1992","1994","1996","1993"],1],["Which 1995 Nintendo console displayed games only in red and black?",["Virtual Boy","Game Boy Color","Super Famicom","Pokémon Mini"],0],["Which Nintendo console launched in 1996 with a three-pronged controller?",["GameCube","Nintendo 64","Super NES","Wii"],1],["Who designed Pac-Man?",["Toru Iwatani","Shigeru Miyamoto","Masaya Nakamura","Yu Suzuki"],0],["In what year was Pac-Man released?",["1978","1980","1982","1984"],1],["In what year did Donkey Kong arrive in arcades?",["1979","1981","1983","1985"],1],["Super Mario Bros. launched in Japan in which year?",["1983","1985","1987","1989"],1],["Which hero was revealed to be a woman at the end of the original 1986 Metroid?",["Samus Aran","Ripley","Lara Croft","Chun-Li"],0],["In what year was The Legend of Zelda: Ocarina of Time released?",["1996","1998","2000","2002"],1],["Which Zelda game launched alongside the Nintendo Switch in 2017?",["Twilight Princess","Skyward Sword","Breath of the Wild","A Link Between Worlds"],2],["In what year did the first Pokémon games release in Japan?",["1994","1996","1998","2000"],1],["Who created Pokémon?",["Satoshi Tajiri","Hideo Kojima","Gunpei Yokoi","Hiroshi Yamauchi"],0],["In what year was Half-Life released?",["1996","1998","2000","2002"],1],["What is the name of Half-Life's silent protagonist?",["Gordon Freeman","Adrian Shephard","Alyx Vance","Barney Calhoun"],0],["Portal first appeared in which 2007 compilation?",["The Orange Box","Half-Life Anthology","Valve Collection","Steam Pack"],0],["Which studio made the 1996 shooter Quake?",["Id Software","Valve","Epic Games","Bungie"],0],["Which id Software game from 1992 helped define the first-person shooter?",["Wolfenstein 3D","Duke Nukem 3D","Marathon","Descent"],0],["Which studio developed GoldenEye 007 for the Nintendo 64?",["Rare","Nintendo EAD","Bungie","Treyarch"],0],["Which company released StarCraft in 1998?",["Blizzard","Westwood","Ensemble Studios","Relic"],0],["Which Blizzard action RPG launched in 1996?",["Diablo","Torchlight","Titan Quest","Baldur's Gate"],0],["Warcraft: Orcs & Humans, the start of the Warcraft series, came out in which year?",["1990","1994","1998","2002"],1],["Who created SimCity and The Sims?",["Will Wright","Sid Meier","Peter Molyneux","Richard Garriott"],0],["Who designed the Civilization series?",["Sid Meier","Will Wright","Tim Schafer","Ron Gilbert"],0],["Which studio developed the 1993 adventure game Myst?",["Cyan","Sierra","LucasArts","Infocom"],0],["Which studio made Age of Empires in 1997?",["Ensemble Studios","Blizzard","Relic","Firaxis"],0],["Lemmings developer DMA Design later became which studio?",["Rockstar North","Naughty Dog","Rare","Bungie"],0],["In what year was Grand Theft Auto V released?",["2011","2013","2015","2017"],1],["Who created Minecraft?",["Markus Persson","Gabe Newell","Tim Sweeney","Jens Bergensten"],0],["Microsoft bought Mojang in 2014 for roughly how much?",["$250 million","$2.5 billion","$25 billion","$500 million"],1],["Which studio developed Fortnite, launched in 2017?",["Epic Games","Valve","Riot Games","Bungie"],0],["Which company developed League of Legends?",["Riot Games","Valve","Blizzard","Epic Games"],0],["Which company developed Dota 2?",["Valve","Riot Games","Blizzard","Hi-Rez"],0],["Which company released the team shooter Overwatch in 2016?",["Blizzard","Valve","Electronic Arts","Ubisoft"],0],["Which studio made the party game Among Us?",["Innersloth","Mojang","Supercell","Re-Logic"],0],["Which company bought Twitch in 2014?",["Amazon","Google","Microsoft","Facebook"],0],["In what year did Twitch launch?",["2009","2011","2013","2015"],1],["In what year did the Xbox 360 launch?",["2003","2005","2007","2009"],1],["In what year did the PlayStation 3 launch?",["2004","2006","2008","2010"],1],["In what year did the PlayStation 4 launch?",["2011","2013","2015","2017"],1],["In what year did the PlayStation 5 launch?",["2018","2019","2020","2021"],2],["In what year was Xbox Live launched?",["1999","2002","2005","2007"],1],["Which 2004 game was a landmark for online play on Xbox Live?",["Halo 2","Fable","Forza Motorsport","Crimson Skies"],0],["Which 1993 Atari console was marketed as 64-bit?",["Jaguar","Lynx","Falcon","Panther"],0],["Which 1982 home computer is often cited as the best-selling single model ever?",["Commodore 64","ZX Spectrum","Apple II","Amstrad CPC"],0],["Who invented the Magnavox Odyssey, the first home console?",["Ralph Baer","Nolan Bushnell","Allan Alcorn","Steve Jobs"],0],["Spacewar!, one of the earliest computer games, ran on which 1960s computer?",["PDP-1","Apple II","IBM 360","Commodore PET"],0],["Tennis for Two in 1958 was created by which physicist?",["William Higinbotham","Ralph Baer","Steve Russell","Ted Dabney"],0],["Who created Computer Space, the first commercial arcade game, in 1971?",["Nolan Bushnell","Ralph Baer","Shigeru Miyamoto","Trip Hawkins"],0],["Who programmed the original Pong for Atari?",["Allan Alcorn","Nolan Bushnell","Ralph Baer","Howard Scott Warshaw"],0],["Activision was founded by former developers of which company?",["Atari","Nintendo","Sega","Mattel"],0],["Who founded Electronic Arts in 1982?",["Trip Hawkins","Nolan Bushnell","Bill Gates","Gabe Newell"],0],["Which company published the text adventure Zork?",["Infocom","Sierra","Origin","Activision"],0],["Which 1980 game gave its name to the 'roguelike' genre?",["Rogue","Zork","Adventure","Nethack"],0],["Which racing game starring Mario's cast arrived on the SNES in 1992?",["Super Mario Kart","F-Zero","Mario Paint","Top Gear"],0],["The Konami Code first appeared in which game?",["Gradius","Contra","Castlevania","Metal Gear"],0],["Which company created Mega Man in 1987?",["Capcom","Konami","Sega","Namco"],0],["Which company created Castlevania?",["Konami","Capcom","Square","Taito"],0],["Which company developed the first Resident Evil in 1996?",["Capcom","Konami","Square","Sega"],0],["On which console did Metal Gear Solid launch in 1998?",["PlayStation","Nintendo 64","Saturn","Dreamcast"],0],["Who is the main protagonist of Final Fantasy VII?",["Cloud Strife","Squall Leonhart","Zidane Tribal","Tidus"],0],["Which studio made Chrono Trigger in 1995?",["Square","Enix","Capcom","Konami"],0],["Who created Dragon Quest?",["Yuji Horii","Hironobu Sakaguchi","Hideo Kojima","Koji Igarashi"],0],["Who created Kirby?",["Masahiro Sakurai","Shigeru Miyamoto","Satoru Iwata","Eiji Aonuma"],0],["On which console did the first Super Smash Bros. launch in 1999?",["Nintendo 64","GameCube","Super NES","Wii"],0],["In what year did Animal Crossing: New Horizons launch?",["2018","2019","2020","2021"],2],["What was Mario's original job in Donkey Kong?",["Carpenter","Plumber","Painter","Baker"],0],["What was Mario originally called during development?",["Jumpman","Mr. Video","Plumberman","Marty"],0],["What was Dr. Eggman originally called in Western Sonic releases?",["Dr. Robotnik","Dr. Wily","Dr. Eggbert","Dr. Ivo"],0],["Which programmer was a co-creator of Sonic the Hedgehog?",["Yuji Naka","Hideo Kojima","Yu Suzuki","Tetsuya Mizuguchi"],0],["Which studio created Crash Bandicoot?",["Naughty Dog","Insomniac","Rare","Sucker Punch"],0],["Which studio created the original Spyro the Dragon?",["Insomniac Games","Naughty Dog","Core Design","Traveller's Tales"],0],["Which studio developed The Last of Us?",["Naughty Dog","Santa Monica Studio","Insomniac","Bungie"],0],["Who is the protagonist of the God of War series?",["Kratos","Atreus","Ares","Perseus"],0],["In what year was Uncharted: Drake's Fortune released?",["2005","2007","2009","2011"],1],["Which studio developed BioShock?",["Irrational Games","Bethesda","Valve","Ubisoft"],0],["Which studio developed The Elder Scrolls V: Skyrim?",["Bethesda Game Studios","BioWare","Obsidian","CD Projekt Red"],0],["Which studio developed The Witcher 3: Wild Hunt?",["CD Projekt Red","Bethesda","BioWare","Ubisoft"],0],["Which studio developed Dark Souls?",["FromSoftware","Capcom","Square Enix","Platinum Games"],0],["Which author collaborated with FromSoftware on Elden Ring's world?",["George R. R. Martin","J. R. R. Tolkien","Neil Gaiman","Brandon Sanderson"],0],["Which studio developed Red Dead Redemption 2?",["Rockstar Games","Ubisoft","Naughty Dog","CD Projekt Red"],0],["Cyberpunk 2077 launched in which year?",["2018","2019","2020","2022"],2],["Which game was bundled with most Wii consoles?",["Wii Sports","Mario Kart Wii","Super Smash Bros. Brawl","Wii Play"],0],["Which studio developed the original Guitar Hero in 2005?",["Harmonix","Neversoft","Activision","Konami"],0],["Which company created Dance Dance Revolution?",["Konami","Namco","Sega","Capcom"],0],["Which studio made Angry Birds?",["Rovio","Supercell","King","Zynga"],0],["Who created Flappy Bird?",["Dong Nguyen","Notch","Eric Barone","Toby Fox"],0],["Which company created Candy Crush Saga?",["King","Zynga","Rovio","Supercell"],0],["Which company developed Pokémon GO?",["Niantic","Nintendo","Game Freak","Zynga"],0],["Which NES accessory was used to play Duck Hunt?",["Zapper","Power Glove","Robot Gyro","Roll-n-Rocker"],0],["What was the name of the robot accessory sold with the American NES?",["R.O.B.","Gyro","Pixel","Tobor"],0],["Which company created the Tamagotchi?",["Bandai","Tomy","Sega","Konami"],0],["In what year was the first E3 held?",["1993","1995","1997","1999"],1],["In what year was the ESRB created?",["1990","1994","1998","2002"],1],["In what year did the Game Boy Color launch?",["1996","1998","2000","2002"],1],["In what year did the Game Boy Advance launch?",["1999","2001","2003","2005"],1],["In what year did the Nintendo DS launch?",["2002","2004","2006","2008"],1],["In what year was the Steam Deck released?",["2020","2021","2022","2023"],2],["In what year did the Nintendo Switch 2 launch?",["2023","2024","2025","2026"],2],["Who created Stardew Valley?",["Eric Barone","Toby Fox","Markus Persson","Dong Nguyen"],0],["Which studio made Hollow Knight?",["Team Cherry","Supergiant Games","Re-Logic","Motion Twin"],0],["Who created Undertale?",["Toby Fox","Eric Barone","Dong Nguyen","Jonathan Blow"],0],["Which studio made Terraria?",["Re-Logic","Mojang","Team Cherry","Innersloth"],0],["In what year was Roblox first released?",["2002","2006","2010","2014"],1],["Which company made the 1981 arcade shooter Galaga?",["Namco","Taito","Atari","Williams"],0],["Which company made the 1979 arcade game Asteroids?",["Atari","Namco","Taito","Williams"],0],["Which company made the 1981 arcade game Defender?",["Williams","Atari","Namco","Konami"],0],["Which company made the 1981 arcade game Frogger?",["Konami","Sega","Namco","Capcom"],0],["Which was one of the four original ghosts in Pac-Man?",["Clyde","Sue","Spooky","Boo"],0],["Dragon's Lair in 1983 featured animation by which former Disney animator?",["Don Bluth","Walt Disney","Chuck Jones","Ub Iwerks"],0],["Who designed the 1986 Sega arcade racer Out Run?",["Yu Suzuki","Yuji Naka","Hiroshi Kawaguchi","Tetsuya Mizuguchi"],0],["Which Sega studio made Virtua Fighter, the first 3D fighting game?",["Sega AM2","Sonic Team","Team Andromeda","Overworks"],0],["Which company made the Neo Geo?",["SNK","Sega","NEC","Atari"],0],["Which company made the TurboGrafx-16?",["NEC","Sega","SNK","Sony"],0],["Which company released the Sega Genesis as the Mega Drive in Japan?",["Sega","Nintendo","NEC","SNK"],0],["Which company founded by Gabe Newell and Mike Harrington created Half-Life?",["Valve","Id Software","Blizzard","Bungie"],0],["Before Halo, Bungie's Marathon series was made for which computers?",["Macintosh","Amiga","Atari ST","Commodore 64"],0],["In what year was the FIFA series first released?",["1989","1993","1997","2001"],1],["In what year was Blizzard founded, then as Silicon & Synapse?",["1987","1991","1995","1999"],1],["Which 1982 Activision game starred Pitfall Harry?",["Pitfall!","Keystone Kapers","River Raid","Enduro"],0]];
const ENTRIES = { crowned: 10, duke: 3, knight: 1, squire: 0, peasant: 0 };
const tierOf = r => r >= 10 ? "crowned" : r >= 8 ? "duke" : r >= 6 ? "knight" : r >= 3 ? "squire" : "peasant";
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const norm = e => String(e || "").trim().toLowerCase();
const okEmail = e => e.length < 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const entryCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 8; i++) s += c[crypto.randomInt(c.length)]; return `CROWN-${s.slice(0, 4)}-${s.slice(4)}`; };

const store = n => getStore({ name: n, consistency: "strong" });
const get = (n, k) => store(n).get(k, { type: "json" });
const put = (n, k, v, o) => store(n).setJSON(k, v, o);
const del = (n, k) => store(n).delete(k);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status, error) => json({ error }, status);
const receipt = a => ({ tier: a.tier, entries: a.entries, code: a.code });

async function limited(ip, action, max) {
  const k = `${action}:${sha(String(ip))}:${Math.floor(Date.now() / 3600000)}`;
  const n = ((await get("limits", k)) || 0) + 1;
  await put("limits", k, n);
  return n > max;
}

async function mail(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[mail to ${to}] ${subject}\n${text}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text })
  });
  if (!r.ok) throw new Error("mail failed " + r.status);
}

async function sendCode(email, session) {
  const code = String(crypto.randomInt(100000, 1000000));
  await put("codes", sha(email), { hash: sha(code + email), session, expires: Date.now() + 600000, tries: 0 });
  await mail(email, "Your Crown the Game code", `Your verification code is ${code}. It expires in 10 minutes.`);
}
async function checkCode(email, code) {
  const k = sha(email), row = await get("codes", k);
  if (!row || row.expires < Date.now() || row.tries >= 5) return null;
  row.tries++; await put("codes", k, row);
  if (sha(String(code || "") + email) !== row.hash) return null;
  await del("codes", k);
  return row;
}

function isAdmin(url) {
  const want = process.env.ADMIN_KEY || "", got = url.searchParams.get("key") || "";
  return want.length >= 12 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
async function allAccounts() {
  const { blobs } = await store("accounts").list();
  return (await Promise.all(blobs.map(b => get("accounts", b.key)))).filter(Boolean);
}

export default async (req, context) => {
  const url = new URL(req.url), route = url.pathname.replace(/^\/api/, ""), ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";

  if (req.method === "GET") {
    if (route === "/health") return json({ ok: true, questions: BANK.length });
    if (route === "/admin/entries" || route === "/admin/draw") {
      if (!isAdmin(url)) return fail(403, "error");
      const accts = (await allAccounts()).filter(a => a.entries > 0);
      if (route === "/admin/draw") {
        const total = accts.reduce((n, a) => n + a.entries, 0);
        if (!total) return json({ winner: null });
        let r = crypto.randomInt(total), w = accts[0];
        for (const a of accts) { if (r < a.entries) { w = a; break; } r -= a.entries; }
        return json({ winner: { email: w.email, tier: w.tier, entries: w.entries, code: w.code }, totalEntries: total, players: accts.length });
      }
      const rows = ["email,tier,entries,code,created", ...accts.map(a => [a.email, a.tier, a.entries, a.code, new Date(a.created).toISOString()].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))];
      return new Response(rows.join("\n"), { headers: { "content-type": "text/csv", "cache-control": "no-store" } });
    }
    return fail(404, "error");
  }
  if (req.method !== "POST") return fail(405, "error");
  const b = await req.json().catch(() => ({}));

  try {
    if (route === "/start") {
      if (await limited(ip, "start", 10)) return fail(429, "rate_limited");
      const all = [...BANK.keys()];
      for (let i = all.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
      const ids = all.slice(0, 10), id = crypto.randomUUID();
      await put("sessions", id, { ids, pos: 0, correct: 0, score: 0, done: false, created: Date.now() });
      return json({ session: id, questions: ids.map(n => ({ id: n, q: BANK[n][0], options: BANK[n][1] })) });
    }

    if (route === "/answer") {
      const s = await get("sessions", String(b.session));
      if (!s || s.done || s.ids[s.pos] !== b.qid) return fail(400, "error");
      const ms = Math.min(15000, Math.max(300, Number(b.ms) || 15000)), a = BANK[b.qid][2], ok = b.choice === a;
      const points = ok ? 100 + Math.round((15 - ms / 1000) * 10) : 0;
      s.pos++; if (ok) s.correct++; s.score += points;
      await put("sessions", String(b.session), s);
      return json({ answerIndex: a, points });
    }

    if (route === "/finish") {
      const s = await get("sessions", String(b.session));
      if (!s || s.pos < 10) return fail(400, "error");
      s.done = true; await put("sessions", String(b.session), s);
      const tier = tierOf(s.correct);
      return json({ right: s.correct, score: s.score, tier, entries: ENTRIES[tier] });
    }

    if (route === "/claim") {
      const email = norm(b.email);
      if (await limited(ip, "claim", 12)) return fail(429, "rate_limited");
      const s = await get("sessions", String(b.session));
      if (!okEmail(email) || !s || !s.done || !ENTRIES[tierOf(s.correct)]) return fail(400, "error");
      if ((await get("accounts", sha(email))) || (await get("claims", String(b.session)))) return fail(409, "played");
      await sendCode(email, String(b.session));
      return json({ status: "verify" });
    }

    if (route === "/verify") {
      const email = norm(b.email), row = await checkCode(email, b.code);
      if (!row || row.session !== String(b.session)) return fail(400, "invalid_code");
      const s = await get("sessions", row.session), tier = tierOf(s.correct), key = sha(email);
      if ((await get("accounts", key)) || (await get("claims", row.session))) return fail(409, "played");
      const acct = { email, tier, entries: ENTRIES[tier], code: entryCode(), session: row.session, created: Date.now() };
      await put("claims", row.session, key);
      await put("accounts", key, acct, { onlyIfNew: true });
      const saved = await get("accounts", key);
      if (!saved || saved.session !== row.session) return fail(409, "played");
      await mail(email, "Your Crown the Game entry receipt", `Title: ${tier}\nDraw entries: ${acct.entries}\nEntry code: ${acct.code}\nKeep this code to claim a prize.`);
      return json(receipt(acct));
    }

    if (route === "/signin") {
      const email = norm(b.email);
      if (await limited(ip, "signin", 12)) return fail(429, "rate_limited");
      if (!okEmail(email)) return fail(400, "error");
      if (await get("accounts", sha(email))) await sendCode(email, null);
      return json({ status: "verify" });
    }

    if (route === "/signin/verify") {
      const email = norm(b.email), row = await checkCode(email, b.code);
      const a = row && await get("accounts", sha(email));
      if (!a) return fail(400, "invalid_code");
      return json(receipt(a));
    }
  } catch (e) {
    console.error(e);
    return fail(500, "error");
  }
  return fail(404, "error");
};
