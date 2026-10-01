import { useMemo } from 'react';
import type { AgentState } from '../../../../daemon/src/types';
import { Person } from '../Person';
import { Room } from './Room';
import { Bench, SeatKit } from './Bench';
import { useAgents } from '../../store/agents';
import { useWander, WANDER_SPEED } from '../../hooks/useWander';
import { useSeats } from '../../hooks/useAgents';
import { SEAT_Z, officePlan, seatToWorld, type OfficePlan, type Seat } from './officePlan';

type Vec3 = [number, number, number];

/** Open-plan office after the real one: agents take bench seats front row first (and keep them); the rest stay empty like a real floor. */
export function OfficeLayout({ agents }: { agents: AgentState[] }) {
  const { seatOf, size } = useSeats();
  const plan = useMemo(() => officePlan(size), [size]);
  const bySeat = useMemo(() => new Map(agents.map((a) => [seatOf.get(a.id), a])), [agents, seatOf]);
  // the front is open so the overview camera can see in; walking around, it's a real wall with the entrance (and a ceiling)
  const walk = useAgents((s) => s.walk);
  // filtered-out agents leave an empty desk, so nobody else changes seat
  const hidden = useAgents((s) => s.hiddenStatuses);
  return (
    <>
      <Room plan={plan} closed={walk} />
      {plan.benches.map((b, i) => <Bench key={i} x={b.x} z={b.z} L={b.L} />)}
      {plan.seats.map((seat, i) => {
        const a = bySeat.get(i);
        return a && !hidden.includes(a.status)
          ? <DeskAgent key={a.id} agent={a} seat={seat} plan={plan} index={i} />
          : <group key={`empty${i}`} position={[seat.x, 0, seat.z]} rotation={[0, seat.rotY, 0]}><SeatKit index={i} /></group>;
      })}
    </>
  );
}

const at = (seat: Seat, lx: number, lz: number): Vec3 => { const [x, z] = seatToWorld(seat, lx, lz); return [x, 0, z]; };

/** One agent's seat + the person, who may wander off while idle (see useWander). */
function DeskAgent({ agent: a, seat, plan, index }: { agent: AgentState; seat: Seat; plan: OfficePlan; index: number }) {
  // working: seated at the monitor; idle (done): seated, leaning back and swivelled away from the screen;
  // needs you / exited: stood up out in the aisle beside the (tucked-in) chair so you notice them
  const seatedHere = a.status === 'working' || a.status === 'idle';
  const home: Vec3 = seatedHere ? at(seat, 0, a.status === 'idle' ? SEAT_Z + 0.15 : SEAT_Z) : at(seat, 0.75, 1.6);
  const deskFacing = Math.PI + seat.rotY; // looking at the monitor
  const facing = a.status === 'working' ? deskFacing : a.status === 'idle' ? deskFacing + 0.7 : seat.rotY;
  const trip = useWander(a, plan, seat, home);
  const end = trip ? trip.route[trip.route.length - 1] : home;
  return (
    <>
      <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotY, 0]}><SeatKit agent={a} index={index} away={!!trip} /></group>
      <Person agent={a} target={end} route={trip?.route} speed={trip ? WANDER_SPEED : undefined}
        facing={trip?.away ? trip.face : facing} place={trip?.away ? 'spot' : 'desk'} />
    </>
  );
}
