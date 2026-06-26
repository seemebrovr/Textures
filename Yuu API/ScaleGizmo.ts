import { Color } from "./Basic Types/Color";
import { Quaternion } from "./Basic Types/Quaternion";
import { Vector3 } from "./Basic Types/Vector3";
import { Controller } from "./Controller";
import { Entity } from "./Entity";
import { Events } from "./Events";
import { grabbable, Hand } from "./Grabbable";
import { Player } from "./Player";
import { registerStart } from "./RegisterStart";
import { spawnPrimitive } from "./SpawnPrimitive";


// ============================================================================
// ScaleGizmo - uniform resize handles for an entity.
// ----------------------------------------------------------------------------
// While the target entity is "selected" (being held), three colored handles
// (X = red, Y = green, Z = blue) appear sticking out of it. Grab a handle with
// your FREE hand (grip) and move that hand away from / toward the holding hand
// to grow / shrink the whole object uniformly.
//
// Uniform scaling: every axis changes together, so a cube stays a cube. Which
// handle you grab doesn't matter - they all scale uniformly (the handles are the
// XYZ gizmo so you can see the object's orientation).
// ============================================================================


type GizmoOptions = {
  /** Called with the new uniform size whenever the object is scaled. */
  onScale?: (size: number) => void,
}

type GizmoState = {
  target: Entity,
  handles: Entity[],
  options: GizmoOptions,
}


const gizmos: GizmoState[] = [];

const handleSize = 0.05;        // size of each handle cube (meters)
const handleGap = 0.12;         // how far beyond the object's surface a handle floats
const handleGrabRadius = 0.08;  // how close a hand must be to grab a handle
const scaleSensitivity = 1.0;   // size change per meter of hand-spread change
const minSize = 0.05;
const maxSize = 1.2;


// The single active drag, if any.
let dragGizmo: GizmoState | undefined;
let dragHand: Hand | undefined;     // the free hand pulling the handle
let dragRefHand: Hand | undefined;  // the hand holding the object
let dragStartSpread = 0;            // distance between the two hands when the drag began
let dragStartSize = 0;              // object size when the drag began


export const scaleGizmo = {
  attach,
};


/**
 * Add uniform scale handles to an entity. The handles appear whenever the entity
 * is held, and let you resize it by grabbing a handle with your free hand.
 * @param target the entity to resize (its scale is assumed uniform)
 * @param options optional onScale callback (e.g. to keep grab points in sync)
 */
function attach(target: Entity, options: GizmoOptions = {}): void {
  const handles = [
    makeHandle(Color.red),                // X
    makeHandle(Color.green),              // Y
    makeHandle(new Color(0.2, 0.45, 1)),  // Z
  ];

  gizmos.push({ target: target, handles: handles, options: options });
}


function makeHandle(color: Color): Entity {
  const handle = spawnPrimitive.cube(
    new Vector3(0, -100, 0), // parked out of sight until shown
    new Vector3(handleSize, handleSize, handleSize),
    Quaternion.one,
    color,
    1,
    false,   // no collider - we detect the hand by proximity
    'Empty', // no physics
    undefined
  );

  handle.visible.set(false);

  return handle;
}


// +X, +Y, +Z directions rotated into the target's current orientation.
function localAxes(target: Entity): Vector3[] {
  const rot = target.rot;

  return [
    rot.rotateVector(Vector3.right), // +X
    rot.rotateVector(Vector3.up),    // +Y
    rot.rotateVector(Vector3.back),  // +Z  (Vector3.back is (0, 0, 1))
  ];
}

function setHandlesVisible(gizmo: GizmoState, visible: boolean): void {
  gizmo.handles.forEach((handle) => handle.visible.set(visible));
}

function updateHandles(gizmo: GizmoState): void {
  const center = gizmo.target.pos;
  const rot = gizmo.target.rot;
  const axes = localAxes(gizmo.target);
  const dist = (gizmo.target.scale.x / 2) + handleGap;

  for (let i = 0; i < gizmo.handles.length; i++) {
    gizmo.handles[i].pos = center.add(axes[i].multiply(dist));
    gizmo.handles[i].rot = rot;
  }
}


function handPos(hand: Hand): Vector3 | undefined {
  return hand === 'Left' ? Player.leftHand.position.get() : Player.rightHand.position.get();
}

function nearestHandleDistance(gizmo: GizmoState, pos: Vector3): number {
  let nearest = Infinity;

  gizmo.handles.forEach((handle) => {
    const dist = handle.pos.distanceTo(pos);

    if (dist < nearest) {
      nearest = dist;
    }
  });

  return nearest;
}


function tryStartDrag(hand: Hand): void {
  if (dragGizmo) {
    return; // already dragging
  }

  const pos = handPos(hand);

  if (!pos) {
    return;
  }

  for (const gizmo of gizmos) {
    const holders = grabbable.heldBy(gizmo.target);

    // Must be selected (held) by the OTHER hand, leaving this hand free to scale.
    if (holders.length === 0 || holders.includes(hand)) {
      continue;
    }

    if (nearestHandleDistance(gizmo, pos) > handleGrabRadius) {
      continue;
    }

    const refHand = holders[0];
    const refPos = handPos(refHand);

    if (!refPos) {
      continue;
    }

    dragGizmo = gizmo;
    dragHand = hand;
    dragRefHand = refHand;
    dragStartSpread = refPos.distanceTo(pos);
    dragStartSize = gizmo.target.scale.x;
    return;
  }
}

function stopDrag(hand: Hand): void {
  if (dragHand === hand) {
    dragGizmo = undefined;
    dragHand = undefined;
    dragRefHand = undefined;
  }
}


registerStart(start);
function start() {
  Events.onPhysicsUpdate(onPhysicsUpdate);

  Controller.subscribe('leftGrip', 'Pressed', () => tryStartDrag('Left'));
  Controller.subscribe('leftGrip', 'Released', () => stopDrag('Left'));
  Controller.subscribe('rightGrip', 'Pressed', () => tryStartDrag('Right'));
  Controller.subscribe('rightGrip', 'Released', () => stopDrag('Right'));
}

function onPhysicsUpdate(deltaTime: number) {
  // Show + position handles for any selected (held) target; hide the rest.
  gizmos.forEach((gizmo) => {
    const selected = gizmo.target.exists() && grabbable.isHeld(gizmo.target);

    setHandlesVisible(gizmo, selected);

    if (selected) {
      updateHandles(gizmo);
    }
  });

  // Apply the active scale drag, if any.
  if (dragGizmo && dragHand && dragRefHand) {
    if (!grabbable.isHeld(dragGizmo.target)) {
      stopDrag(dragHand); // object was released -> stop scaling
      return;
    }

    const pos = handPos(dragHand);
    const refPos = handPos(dragRefHand);

    if (!pos || !refPos) {
      return;
    }

    const spread = refPos.distanceTo(pos);
    const delta = spread - dragStartSpread;

    let newSize = dragStartSize + (delta * scaleSensitivity);
    newSize = Math.max(minSize, Math.min(maxSize, newSize));

    dragGizmo.target.scale = new Vector3(newSize, newSize, newSize);

    dragGizmo.options.onScale?.(newSize);
  }
}
