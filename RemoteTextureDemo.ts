import { Async } from "./Yuu API/Async";
import { Color } from "./Yuu API/Basic Types/Color";
import { Quaternion } from "./Yuu API/Basic Types/Quaternion";
import { Vector3 } from "./Yuu API/Basic Types/Vector3";
import { inWorldConsole } from "./Yuu API/Console";
import { Entity } from "./Yuu API/Entity";
import { registerStart } from "./Yuu API/RegisterStart";
import { applyRemoteTexture, fetchManifest } from "./Yuu API/RemoteTexture";
import { spawnPrimitive } from "./Yuu API/SpawnPrimitive";
import { Texture } from "./Yuu API/Texture";


/**
 * RemoteTexture DIAGNOSTIC demo
 * =============================
 * Walks through the pipeline in stages, AFTER the world has loaded, with numbered
 * logs and pauses between stages so the in-world console shows how far it gets before
 * any crash. Whatever the LAST "[RT] N ..." line you see is, that's the step that failed.
 *
 * Stage map:
 *   0,1  world load + spawn cube              (no texture/network yet)
 *   2-6  LOCAL texture: create, fill, update, apply   (NO networking, NO per-pixel loop)
 *   7,8  NETWORK: fetch the manifest only     (the blocking HTTP call, deferred off load)
 *   9,10 REMOTE: full fetch + rebuild + apply (gentle: mipmaps off, 1024 px/frame)
 *
 * If the cube turns BLUE you know local textures work; if it then turns BRICK the whole
 * path works. Tell me the last [RT] number you saw.
 */

const TEXTURE_HOST = 'describing-conservation-refer-johns.trycloudflare.com'; // update if cloudflared restarted
const TEXTURE_PATH = '/tex/brick_01.json';

function log(msg: string) { console.log('[RT] ' + msg); }

let cube: Entity | undefined;


registerStart(start);

function start() {
  inWorldConsole.visible(true, new Vector3(0, 2, -2));
  log('0 world loaded');

  cube = spawnPrimitive.cube(
    new Vector3(0, 1.5, -1.5),
    new Vector3(0.5, 0.5, 0.5),
    Quaternion.one,
    new Color(1, 1, 1),
    1,
    true,
    'Static',
    undefined,
  );
  log('1 cube spawned');

  // Defer all texture/network work off the load frame.
  Async.setTimeout(stageLocalTexture, 2000);
}


// Stage A - purely local texture. No networking, no per-pixel loop.
function stageLocalTexture() {
  if (!cube) { return; }

  log('2 creating local 64x64 texture');
  const tex = new Texture(64, 64);
  log('3 texture created id=' + tex.imageID);

  tex.fillWithColor(new Color(0.2, 0.5, 1), 1);
  log('4 filled blue');

  tex.updateTexture();
  log('5 updateTexture ok');

  cube.mesh.texture.set(tex, false); // mipmaps off
  log('6 applied -> cube should be BLUE');

  Async.setTimeout(stageManifest, 3000);
}


// Stage B - networking only (the blocking HTTP GET), well after load.
function stageManifest() {
  log('7 fetching manifest...');
  const manifest = fetchManifest(TEXTURE_HOST);
  log('8 manifest ok: ' + manifest.length + ' texture(s)');

  Async.setTimeout(stageRemote, 3000);
}


// Stage C - full remote texture, gentlest settings.
function stageRemote() {
  if (!cube) { return; }

  log('9 applying remote texture...');
  applyRemoteTexture(cube, TEXTURE_HOST, TEXTURE_PATH, { useMipMaps: false, pixelsPerFrame: 1024 })
    .then(() => { log('10 remote applied -> cube should be BRICK'); })
    .catch((e) => { log('ERR ' + e); });
}
