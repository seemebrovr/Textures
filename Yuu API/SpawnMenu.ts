import { Color } from "./Basic Types/Color";
import { Quaternion } from "./Basic Types/Quaternion";
import { Vector3 } from "./Basic Types/Vector3";
import { Controller } from "./Controller";
import { Entity } from "./Entity";
import { Hand } from "./Grabbable";
import { Player } from "./Player";
import { Raycast } from "./Raycast";
import { registerStart } from "./RegisterStart";
import { spawnPrimitive } from "./SpawnPrimitive";


// ============================================================================
// SpawnMenu - a palette that pops up in front of the player (left X button).
// ----------------------------------------------------------------------------
// Each button runs a spawn action. Point a hand at a button and pull the trigger
// to activate it; the action is told WHICH hand clicked (so it can spawn the
// object straight into that hand).
//
// We do our own per-hand raycast on trigger (rather than the shared ray-click
// callback) because that callback doesn't say which hand clicked.
// ============================================================================


export type SpawnMenuItem = {
  label: string,
  color: Color,
  onSpawn: (hand: Hand) => void,
}


export const spawnMenu = {
  configure,
  open,
  close,
  toggle,
  isOpen,
}


let items: SpawnMenuItem[] = [];
let menuRoot: Entity | undefined;
let buttons: { entity: Entity, item: SpawnMenuItem }[] = [];


/** Set the list of things the menu can spawn. */
function configure(menuItems: SpawnMenuItem[]): void {
  items = menuItems;
}

function isOpen(): boolean {
  return menuRoot !== undefined;
}

function toggle(): void {
  if (isOpen()) {
    close();
  }
  else {
    open();
  }
}

/** Open the menu floating in front of the player, facing them. */
function open(): void {
  close();

  const headPos = Player.head.position.get();
  const headForward = Player.head.forward.get();

  if (!headPos || !headForward) {
    return;
  }

  // Horizontal facing direction, so the menu stays upright.
  let fx = headForward.x;
  let fz = headForward.z;
  const len = Math.sqrt((fx * fx) + (fz * fz));

  if (len < 0.0001) {
    fx = 0;
    fz = -1;
  }
  else {
    fx /= len;
    fz /= len;
  }

  const center = new Vector3(headPos.x + (fx * 0.9), headPos.y - 0.1, headPos.z + (fz * 0.9));
  const yaw = Math.atan2(-fx, -fz); // face back toward the player
  const rot = Quaternion.fromEuler(new Vector3(0, yaw, 0));

  menuRoot = spawnPrimitive.plane(
    'Front',
    center,
    new Vector3(0.5, 0.3, 1),
    rot,
    new Color(0.12, 0.12, 0.14),
    1,
    'None',
    'Static',
    undefined
  );

  addLabel(menuRoot, new Vector3(0, 0.1, 0.002), 'Spawn', 5, Color.white);

  // Lay the item buttons out in a row.
  const count = items.length;
  const spacing = 0.13;
  const startX = -((count - 1) * spacing) / 2;

  items.forEach((item, i) => {
    const button = makeButton(
      menuRoot!,
      new Vector3(startX + (i * spacing), -0.03, 0.002),
      new Vector3(0.11, 0.11, 1),
      item.label,
      4,
      item.color,
      Color.white
    );

    buttons.push({ entity: button, item: item });
  });
}

function close(): void {
  if (menuRoot) {
    menuRoot.destroy(); // destroys child buttons + text too
  }

  menuRoot = undefined;
  buttons = [];
}


function addLabel(parent: Entity, pos: Vector3, text: string, fontSize: number, color: Color): Entity {
  const label = new Entity(pos, Quaternion.one, Vector3.one, parent, 'Static');

  label.text.create(text, fontSize, 0);
  label.text.doubleSided.set(false);
  label.text.color.set(color);

  return label;
}

function makeButton(parent: Entity, pos: Vector3, scale: Vector3, text: string, fontSize: number, bgColor: Color, textColor: Color): Entity {
  const root = spawnPrimitive.plane(
    'Front',
    pos.add(new Vector3(0, 0, 0.0005)),
    scale,
    Quaternion.one,
    bgColor,
    1,
    'Concave', // collider so the raycast can hit it
    'Static',
    parent
  );

  const label = new Entity(new Vector3(0, 0, 0.001), Quaternion.one, Vector3.one, root, 'Static');

  label.text.create(text, fontSize, 0);
  label.text.doubleSided.set(false);
  label.text.color.set(textColor);

  root.rayClick.initialize(false); // shows the pointer ray; the action is handled below

  return root;
}


registerStart(start);
function start() {
  Controller.subscribe('leftX', 'Pressed', () => toggle());
  Controller.subscribe('leftTrigger', 'Pressed', () => onTrigger('Left'));
  Controller.subscribe('rightTrigger', 'Pressed', () => onTrigger('Right'));
}

function onTrigger(hand: Hand): void {
  if (!isOpen()) {
    return;
  }

  const pos = hand === 'Left' ? Player.leftHand.position.get() : Player.rightHand.position.get();
  const forward = hand === 'Left' ? Player.leftHand.forward.get() : Player.rightHand.forward.get();

  if (!pos || !forward) {
    return;
  }

  const hit = Raycast.directional(pos, forward, 5, { getEntity: true });

  if (hit && hit.entity) {
    const match = buttons.find((b) => b.entity === hit.entity);

    if (match) {
      match.item.onSpawn(hand);
    }
  }
}
