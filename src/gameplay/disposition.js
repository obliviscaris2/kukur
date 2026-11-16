/** A single readable definition of danger: current intent, attack tells and recent actions, never breed or appearance. */
import { THREATS } from '../config/index.js';

export function disposition(actor) {
  if (actor.stunFor > 0) return { cat: 'neutral', reason: 'Stunned — escape now', stunned: true, canStun: false };
  if (actor.dog || actor.tstate || actor.terr) {
    if (actor.terr?.friendly || actor.tstate === 'friend' || (actor.owned && !actor.terr))
      return { cat: 'good', reason: 'Trusted companion', canStun: false };
    if (actor.tstate === 'chase') return { cat: 'danger', reason: 'Charging to bite', canStun: true, urgent: true };
    if (actor.tstate === 'warn') return { cat: 'danger', reason: 'Growling — leave its space or offer food', canStun: true, urgent: false };
    if (actor.state === 'greet' || actor.state === 'play') return { cat: 'good', reason: 'Wants to play', canStun: false };
    return { cat: 'neutral', reason: actor.terr ? 'Guarding home; calm for now' : 'Minding its own business', canStun: false };
  }
  if (actor.state === 'throw' && !actor.thrown) return { cat: 'danger', reason: 'Winding up a stone throw', canStun: true, urgent: true };
  if (['hunt', 'strike'].includes(actor.state))
    return {
      cat: 'danger',
      reason: actor.state === 'strike' ? 'Catch pole raised — dodge!' : 'Dog catcher pursuing you',
      canStun: true,
      urgent: true,
    };
  if (actor.aggression > 0) return { cat: 'danger', reason: 'Just attacked you', canStun: true, urgent: true };
  if (
    actor.playSession ||
    actor.kid ||
    ['feed', 'pet'].includes(actor.state) ||
    ['shopkeeper', 'police'].includes(actor.role) ||
    actor.mood === 'kind'
  )
    return {
      cat: 'good',
      reason: actor.playSession ? 'Playing chase' : actor.state === 'feed' ? 'Offering food' : 'Possible friend',
      canStun: false,
    };
  return {
    cat: 'neutral',
    reason: actor.state === 'angry' || actor.state === 'shoo' ? 'Shooing; no damaging attack' : 'Not attacking',
    canStun: false,
  };
}

export function trafficDanger(car, pup) {
  if (car.waiting || car.pause > 0 || car.speed < THREATS.traffic.minimumSpeed || Math.abs(pup.pos.y - car.y) > 1.1) return false;
  const sign = car.gear === -1 ? -1 : 1,
    fx = Math.sin(car.heading) * sign,
    fz = Math.cos(car.heading) * sign;
  const dx = pup.pos.x - car.x,
    dz = pup.pos.z - car.z,
    along = dx * fx + dz * fz,
    side = Math.abs(dx * fz - dz * fx);
  const length = car.halfLength || 2,
    width = car.halfWidth || 0.8;
  return along > -length && along - length < car.speed * THREATS.traffic.seconds && side < width + THREATS.traffic.margin;
}
