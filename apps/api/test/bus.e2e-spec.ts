import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { bearer, createApp, createParent, createPhoneUser, createSchool, prisma, runId, uniquePhone } from './helpers';

// School bus: fleet and crew, routes and rosters, the driver app, parent alerts and the live map, against a real Postgres.
describe('School bus (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let studentIds: string[];
  let parent1: Awaited<ReturnType<typeof createParent>>;
  let parent2: typeof parent1;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const staff = () => bearer(tokens.STAFF);
  const driver = () => bearer(driverToken);
  // School-local dates (the test school uses the default Asia/Ho_Chi_Minh timezone).
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + offsetDays * 86_400_000));
  const today = vnDate(0);

  let vehicleId: string;
  let driverId: string;
  let monitorId: string;
  let routeId: string;
  let returnRouteId: string;
  let cauGiay: string;
  let nghiaDo: string;
  let driverToken: string;
  let tripId: string;
  const driverPhone = uniquePhone();

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `BA${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `BB${run}`)).tokens;

    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId } });
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: year.id, name: '6A', gradeLevel: 6 } });
    studentIds = [];
    for (const [i, name] of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu'].entries()) {
      const s = await prisma.student.create({
        data: { schoolId, code: `HS${i + 1}`, fullName: name, enrollments: { create: { classId: klass.id, academicYearId: year.id } } },
      });
      studentIds.push(s.id);
    }
    parent1 = await createParent(app, schoolId, [studentIds[0]]);
    parent2 = await createParent(app, schoolId, [studentIds[2]]);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('manages vehicles and flags paperwork expiring within 30 days', async () => {
    await api().get('/api/v1/bus/vehicles').set(bearer(tokens.TEACHER)).expect(403);
    const res = await api()
      .post('/api/v1/bus/vehicles')
      .set(staff())
      .send({ plateNumber: '29b-123.45', model: 'Ford Transit', capacity: 16, inspectionExpiry: vnDate(10), insuranceExpiry: vnDate(90) })
      .expect(201);
    vehicleId = res.body.id;
    expect(res.body).toMatchObject({ plateNumber: '29B-123.45', status: 'ACTIVE', inspectionExpiry: vnDate(10), inspectionDaysLeft: 10, expiring: { inspection: true, insurance: false } });
    await api().post('/api/v1/bus/vehicles').set(staff()).send({ plateNumber: '29B-123.45', capacity: 16 }).expect(409);
    await api().post('/api/v1/bus/vehicles').set(staff()).send({ plateNumber: '29B-000.01', capacity: 16, inspectionExpiry: '2026-02-30' }).expect(400);
    const upd = await api().patch(`/api/v1/bus/vehicles/${vehicleId}`).set(staff()).send({ capacity: 20, insuranceExpiry: null }).expect(200);
    expect(upd.body).toMatchObject({ capacity: 20, insuranceExpiry: null, insuranceDaysLeft: null });
    expect((await api().get('/api/v1/bus/vehicles').set(staff()).expect(200)).body).toHaveLength(1);
  });

  it('manages the crew and creates driver logins', async () => {
    await api().post('/api/v1/bus/staff').set(staff()).send({ fullName: 'X', phone: '123', role: 'DRIVER' }).expect(400);
    const d = await api()
      .post('/api/v1/bus/staff')
      .set(staff())
      .send({ fullName: 'Nguyễn Văn Tài', phone: `+84 ${driverPhone.slice(1)}`, role: 'DRIVER', licenseNumber: 'B2-123', licenseExpiry: '2028-06-30' })
      .expect(201);
    driverId = d.body.id;
    expect(d.body).toMatchObject({ phone: driverPhone, role: 'DRIVER', licenseExpiry: '2028-06-30', user: null, isActive: true, routeCount: 0 });
    monitorId = (await api().post('/api/v1/bus/staff').set(staff()).send({ fullName: 'Trần Thị Hoa', phone: uniquePhone(), role: 'MONITOR' }).expect(201)).body.id;

    const account = await api().post(`/api/v1/bus/staff/${driverId}/account`).set(staff()).expect(201);
    expect(account.body.phone).toBe(driverPhone);
    expect(account.body.password).toMatch(/^[A-Za-z2-9]{8}$/);
    await api().post(`/api/v1/bus/staff/${driverId}/account`).set(staff()).expect(409);
    const login = await api().post('/api/v1/auth/login').send({ phone: driverPhone, password: account.body.password }).expect(200);
    expect(login.body.user).toMatchObject({ role: 'DRIVER', mustChangePassword: true, fullName: 'Nguyễn Văn Tài' });

    const list = await api().get('/api/v1/bus/staff').set(staff()).expect(200);
    expect(list.body.find((s: any) => s.id === driverId).user).toMatchObject({ phone: driverPhone, mustChangePassword: true });

    const reset = await api().post(`/api/v1/bus/staff/${driverId}/reset-password`).set(staff()).expect(200);
    await api().post('/api/v1/auth/login').send({ phone: driverPhone, password: account.body.password }).expect(401);
    driverToken = (await api().post('/api/v1/auth/login').send({ phone: driverPhone, password: reset.body.password }).expect(200)).body.accessToken;
    await api().post(`/api/v1/bus/staff/${monitorId}/reset-password`).set(staff()).expect(404);
  });

  it('builds routes with ordered stops and rosters', async () => {
    // A monitor cannot be the driver.
    await api().post('/api/v1/bus/routes').set(staff()).send({ name: 'Tuyến 1', direction: 'PICKUP', startTime: '06:30', driverId: monitorId }).expect(400);
    const r = await api().post('/api/v1/bus/routes').set(staff()).send({ name: 'Tuyến 1', direction: 'PICKUP', startTime: '06:30', vehicleId, driverId, monitorId }).expect(201);
    routeId = r.body.id;
    expect(r.body).toMatchObject({ vehicle: { plateNumber: '29B-123.45' }, driver: { id: driverId }, monitor: { id: monitorId }, studentCount: 0, stops: [] });
    await api().post('/api/v1/bus/routes').set(staff()).send({ name: 'Tuyến 1', direction: 'DROPOFF', startTime: '16:30' }).expect(409);

    const stops = await api()
      .put(`/api/v1/bus/routes/${routeId}/stops`)
      .set(staff())
      .send({
        stops: [
          { name: 'Ngã tư Cầu Giấy', address: '304 Cầu Giấy', lat: 21.0305, lng: 105.8012, plannedTime: '06:35' },
          { name: 'Công viên Nghĩa Đô', lat: 21.0437, lng: 105.8043, plannedTime: '06:45' },
        ],
      })
      .expect(200);
    [cauGiay, nghiaDo] = stops.body.stops.map((s: any) => s.id);
    expect(stops.body.stops.map((s: any) => s.order)).toEqual([1, 2]);

    await api().put(`/api/v1/bus/routes/${routeId}/assignments`).set(staff()).send({ items: [{ studentId: studentIds[0], stopId: 'nope' }] }).expect(400);
    const roster = await api()
      .put(`/api/v1/bus/routes/${routeId}/assignments`)
      .set(staff())
      .send({ items: [{ studentId: studentIds[0], stopId: cauGiay }, { studentId: studentIds[1], stopId: nghiaDo }] })
      .expect(200);
    expect(roster.body.map((a: any) => [a.student.code, a.stop.order])).toEqual([['HS1', 1], ['HS2', 2]]);
    expect(roster.body[0].student.class.name).toBe('6A');

    // Reordering with ids keeps the assignments.
    const reordered = await api()
      .put(`/api/v1/bus/routes/${routeId}/stops`)
      .set(staff())
      .send({
        stops: [
          { id: nghiaDo, name: 'Công viên Nghĩa Đô', lat: 21.0437, lng: 105.8043, plannedTime: '06:35' },
          { id: cauGiay, name: 'Ngã tư Cầu Giấy', address: '304 Cầu Giấy', lat: 21.0305, lng: 105.8012, plannedTime: '06:40' },
        ],
      })
      .expect(200);
    expect(reordered.body.stops.map((s: any) => [s.id, s.order])).toEqual([[nghiaDo, 1], [cauGiay, 2]]);
    expect(reordered.body.studentCount).toBe(2);

    // A student rides one route per direction.
    const r2 = (await api().post('/api/v1/bus/routes').set(staff()).send({ name: 'Tuyến 2', direction: 'PICKUP', startTime: '06:45' }).expect(201)).body;
    const r2stop = (await api().put(`/api/v1/bus/routes/${r2.id}/stops`).set(staff()).send({ stops: [{ name: 'Chợ Nghĩa Tân', lat: 21.0443, lng: 105.7916 }] }).expect(200)).body.stops[0];
    const clash = await api().put(`/api/v1/bus/routes/${r2.id}/assignments`).set(staff()).send({ items: [{ studentId: studentIds[0], stopId: r2stop.id }] }).expect(400);
    expect(clash.body.message).toBe('Nguyễn Văn An đã ở tuyến "Tuyến 1"');
    await api().put(`/api/v1/bus/routes/${r2.id}/assignments`).set(staff()).send({ items: [{ studentId: studentIds[2], stopId: r2stop.id }] }).expect(200);
    // Stops sent without an id are new ones: the roster on the old stop goes with it.
    await api().put(`/api/v1/bus/routes/${r2.id}/stops`).set(staff()).send({ stops: [{ name: 'Chợ Nghĩa Tân', lat: 21.0443, lng: 105.7916 }] }).expect(200);
    expect((await api().get(`/api/v1/bus/routes/${r2.id}/assignments`).set(staff()).expect(200)).body).toHaveLength(0);
    await api().delete(`/api/v1/bus/routes/${r2.id}`).set(staff()).expect(200);

    // The same student also rides home on a DROPOFF route.
    returnRouteId = (await api().post('/api/v1/bus/routes').set(staff()).send({ name: 'Tuyến 1 (chiều về)', direction: 'DROPOFF', startTime: '16:30', vehicleId, driverId }).expect(201)).body.id;
    const backStop = (await api().put(`/api/v1/bus/routes/${returnRouteId}/stops`).set(staff()).send({ stops: [{ name: 'Ngã tư Cầu Giấy', lat: 21.0305, lng: 105.8012 }] }).expect(200)).body.stops[0];
    await api().put(`/api/v1/bus/routes/${returnRouteId}/assignments`).set(staff()).send({ items: [{ studentId: studentIds[0], stopId: backStop.id }] }).expect(200);
    await api().delete(`/api/v1/bus/routes/${returnRouteId}/assignments/${studentIds[1]}`).set(staff()).expect(404);

    const routes = await api().get('/api/v1/bus/routes').set(staff()).expect(200);
    expect(routes.body.map((x: any) => [x.name, x.studentCount, x.stops.length])).toEqual([['Tuyến 1', 2, 2], ['Tuyến 1 (chiều về)', 1, 1]]);
    expect((await api().get('/api/v1/bus/staff').set(staff()).expect(200)).body.find((s: any) => s.id === driverId).routeCount).toBe(2);
    await api().delete(`/api/v1/bus/vehicles/${vehicleId}`).set(staff()).expect(409);
  });

  it('runs a trip from the driver app and alerts the parents', async () => {
    const stranger = await createPhoneUser(app, schoolId, Role.DRIVER);
    expect((await api().get('/api/v1/driver/trips').set(bearer(stranger.token)).expect(403)).body.message).toBe('Tài khoản chưa gắn với nhân viên xe');
    await api().get('/api/v1/driver/trips').set(staff()).expect(403);

    const mine = await api().get('/api/v1/driver/trips').set(driver()).expect(200);
    expect(mine.body.date).toBe(today);
    expect(mine.body.staff.id).toBe(driverId);
    const trip = mine.body.items.find((t: any) => t.route.id === routeId);
    expect(trip).toMatchObject({ status: 'PLANNED', myRole: 'DRIVER', counts: { total: 2, boarded: 0 }, vehicle: { plateNumber: '29B-123.45' }, lastLocation: null });
    tripId = trip.id;
    // Listing again never duplicates the day's trips.
    expect((await api().get('/api/v1/bus/trips').set(staff()).expect(200)).body.items.filter((t: any) => t.route.id === routeId)).toHaveLength(1);
    await api().get('/api/v1/bus/trips').query({ date: '2026-02-30' }).set(staff()).expect(400);

    expect((await api().post(`/api/v1/driver/trips/${tripId}/location`).set(driver()).send({ lat: 21.03, lng: 105.8 }).expect(400)).body.message).toBe('Chuyến chưa bắt đầu');
    const started = await api().post(`/api/v1/driver/trips/${tripId}/start`).set(driver()).expect(200);
    expect(started.body).toMatchObject({ status: 'RUNNING', vehicle: { id: vehicleId }, driver: { id: driverId } });
    expect(started.body.startedAt).toBeTruthy();
    await api().post(`/api/v1/driver/trips/${tripId}/start`).set(driver()).expect(400);

    await api().post(`/api/v1/driver/trips/${tripId}/location`).set(driver()).send({ lat: 21.0305, lng: 105.8012, speed: 8.5, heading: 90 }).expect(201);
    const live = await api().get('/api/v1/bus/live').set(staff()).expect(200);
    expect(live.body.items.find((t: any) => t.id === tripId)).toMatchObject({ status: 'RUNNING', lastLocation: { lat: 21.0305, lng: 105.8012 }, counts: { total: 2, onBus: 0 } });

    const board = await api().post(`/api/v1/driver/trips/${tripId}/boarding`).set(driver()).send({ studentId: studentIds[0], type: 'BOARD', lat: 21.0305, lng: 105.8012 }).expect(201);
    expect(board.body).toMatchObject({ type: 'BOARD', state: 'ON_BUS', stop: { id: cauGiay }, student: { code: 'HS1' } });
    expect((await api().post(`/api/v1/driver/trips/${tripId}/boarding`).set(driver()).send({ studentId: studentIds[0], type: 'BOARD' }).expect(400)).body.message).toBe('Học sinh đã lên xe');
    expect((await api().post(`/api/v1/driver/trips/${tripId}/boarding`).set(driver()).send({ studentId: studentIds[1], type: 'ALIGHT' }).expect(400)).body.message).toBe('Học sinh chưa lên xe');
    expect((await api().post(`/api/v1/driver/trips/${tripId}/boarding`).set(driver()).send({ studentId: studentIds[2], type: 'BOARD' }).expect(400)).body.message).toBe('Học sinh không thuộc tuyến này');

    const notes = await api().get('/api/v1/notifications').set(bearer(parent1.token)).expect(200);
    const alert = notes.body.items.find((n: any) => n.kind === 'BUS_BOARD');
    expect(alert).toBeTruthy();
    expect(alert.title).toBe('Con đã lên xe');
    expect(alert.body).toMatch(/^Nguyễn Văn An đã lên xe tuyến Tuyến 1 lúc \d{2}:\d{2} tại Ngã tư Cầu Giấy\.$/);
    expect(alert.data).toMatchObject({ tripId, routeId, stopId: cauGiay, type: 'BOARD' });
    expect(alert.studentId).toBe(studentIds[0]);
    expect((await api().get('/api/v1/notifications').set(bearer(parent2.token)).expect(200)).body.items.some((n: any) => n.kind === 'BUS_BOARD')).toBe(false);

    const detail = await api().get(`/api/v1/driver/trips/${tripId}`).set(driver()).expect(200);
    expect(detail.body.counts).toEqual({ total: 2, boarded: 1, onBus: 1, alighted: 0 });
    expect(detail.body.stops.find((s: any) => s.id === cauGiay).students).toMatchObject([{ code: 'HS1', state: 'ON_BUS', lastEvent: { type: 'BOARD' } }]);
    expect(detail.body.stops.find((s: any) => s.id === nghiaDo).students).toMatchObject([{ code: 'HS2', state: 'NOT_BOARDED', lastEvent: null }]);
    expect(detail.body.events).toHaveLength(1);
  });

  it('shows the ride to the parent', async () => {
    const res = await api().get(`/api/v1/parent/children/${studentIds[0]}/bus`).set(bearer(parent1.token)).expect(200);
    expect(res.body.assignments.map((a: any) => a.route.direction)).toEqual(['PICKUP', 'DROPOFF']);
    expect(res.body.assignments[0]).toMatchObject({
      route: { id: routeId, name: 'Tuyến 1', startTime: '06:30' },
      stop: { id: cauGiay, name: 'Ngã tư Cầu Giấy', plannedTime: '06:40', lat: 21.0305, lng: 105.8012 },
      vehicle: { plateNumber: '29B-123.45' },
      driver: { fullName: 'Nguyễn Văn Tài', phone: driverPhone },
    });
    const ride = res.body.today.find((t: any) => t.route.id === routeId);
    expect(ride).toMatchObject({ trip: { id: tripId, status: 'RUNNING', lastLat: 21.0305 }, state: 'ON_BUS' });
    expect(ride.events).toMatchObject([{ type: 'BOARD', stop: { name: 'Ngã tư Cầu Giấy' } }]);
    // The ride home exists for the day too, still planned.
    expect(res.body.today.find((t: any) => t.route.id === returnRouteId).trip.status).toBe('PLANNED');

    await api().get(`/api/v1/parent/children/${studentIds[0]}/bus`).set(bearer(parent2.token)).expect(404);
    await api().get(`/api/v1/parent/children/${studentIds[0]}/bus`).set(staff()).expect(403);
    expect((await api().get(`/api/v1/parent/children/${studentIds[2]}/bus`).set(bearer(parent2.token)).expect(200)).body).toMatchObject({ assignments: [], today: [] });
  });

  it('keeps schools isolated', async () => {
    const other = bearer(otherTokens.ADMIN);
    expect((await api().get('/api/v1/bus/routes').set(other).expect(200)).body).toEqual([]);
    expect((await api().get('/api/v1/bus/live').set(other).expect(200)).body.items).toEqual([]);
    await api().get(`/api/v1/bus/trips/${tripId}`).set(other).expect(404);
    await api().patch(`/api/v1/bus/routes/${routeId}`).set(other).send({ name: 'Khác' }).expect(404);
    await api().post(`/api/v1/bus/trips/${tripId}/cancel`).set(other).expect(404);
    await api().patch(`/api/v1/bus/vehicles/${vehicleId}`).set(other).send({ capacity: 1 }).expect(404);
  });

  it('ends the trip and keeps the record', async () => {
    const ended = await api().post(`/api/v1/driver/trips/${tripId}/end`).set(driver()).expect(200);
    expect(ended.body.status).toBe('DONE');
    expect(ended.body.endedAt).toBeTruthy();
    await api().post(`/api/v1/driver/trips/${tripId}/end`).set(driver()).expect(400);
    await api().post(`/api/v1/driver/trips/${tripId}/boarding`).set(driver()).send({ studentId: studentIds[0], type: 'ALIGHT' }).expect(400);

    const detail = await api().get(`/api/v1/bus/trips/${tripId}`).set(staff()).expect(200);
    expect(detail.body.status).toBe('DONE');
    // Nobody recorded the drop-off: the student stays "on the bus" for the office to check.
    expect(detail.body.stops.find((s: any) => s.id === cauGiay).students[0].state).toBe('ON_BUS');
    expect((await api().get(`/api/v1/bus/trips/${tripId}/locations`).set(staff()).expect(200)).body).toMatchObject([{ lat: 21.0305, lng: 105.8012, speed: 8.5, heading: 90 }]);
    expect((await api().get('/api/v1/bus/live').set(staff()).expect(200)).body.items.some((t: any) => t.id === tripId)).toBe(false);

    await api().post(`/api/v1/bus/trips/${tripId}/cancel`).set(staff()).expect(400);
    const ride = (await api().get('/api/v1/bus/trips').query({ date: today }).set(staff()).expect(200)).body.items.find((t: any) => t.route.id === returnRouteId);
    expect((await api().post(`/api/v1/bus/trips/${ride.id}/cancel`).set(staff()).expect(200)).body.status).toBe('CANCELLED');
    // Routes with trips cannot be deleted.
    await api().delete(`/api/v1/bus/routes/${routeId}`).set(staff()).expect(409);
  });
});
