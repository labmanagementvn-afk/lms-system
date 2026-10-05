import { AssetStatus, AuditStatus, PrismaClient } from '@prisma/client';
import { SeedContext } from './context';

const DAY_MS = 86_400_000;

/** UTC midnight of today (what @db.Date columns hold). */
const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const daysFromNow = (n: number) => new Date(today().getTime() + n * DAY_MS);
/** The 15th of the month `months` months ago. */
const monthsAgo = (months: number) => {
  const t = today();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - months, 15));
};

// Demo fixed assets: categories, suppliers, eight assets in mixed states, one repair,
// one open loan and an open stocktake. Runs after seedHr, which owns the custodians.
export async function seedAssets(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;

  const categories: Record<string, string> = {};
  for (const [name, usefulLifeYears] of [
    ['Máy tính', 4],
    ['Bàn ghế', 8],
    ['Thiết bị dạy học', 5],
  ] as const) {
    categories[name] = (await prisma.assetCategory.create({ data: { schoolId, name, usefulLifeYears } })).id;
  }

  const [computers, furniture] = await Promise.all([
    prisma.supplier.create({
      data: { schoolId, name: 'Công ty CP Máy tính Hà Nội', phone: '02438123456', email: 'sales@mtnh.vn', address: 'Cầu Giấy, Hà Nội', taxCode: '0101234567' },
    }),
    prisma.supplier.create({
      data: { schoolId, name: 'Công ty TNHH Nội thất Hòa Phát', phone: '02436789012', email: 'kinhdoanh@noithathp.vn', address: 'Hoàng Mai, Hà Nội', taxCode: '0107654321' },
    }),
  ]);

  const employees = Object.fromEntries((await prisma.employee.findMany({ where: { schoolId }, select: { id: true, code: true } })).map((e) => [e.code, e.id]));

  const assets: Record<string, string> = {};
  const rows = [
    {
      code: 'TS00001',
      name: 'Máy tính xách tay Dell Latitude 5440',
      categoryId: categories['Máy tính'],
      supplierId: computers.id,
      serialNumber: 'DL5440-2025-0001',
      purchaseDate: monthsAgo(12),
      purchasePrice: 22_000_000,
      location: 'Văn phòng',
      custodianEmployeeId: employees.NV001,
    },
    {
      code: 'TS00002',
      name: 'Máy tính để bàn HP ProDesk 400',
      categoryId: categories['Máy tính'],
      supplierId: computers.id,
      serialNumber: 'HP400-2024-0017',
      purchaseDate: monthsAgo(24),
      purchasePrice: 14_500_000,
      location: 'Phòng Tin học',
      custodianEmployeeId: employees.GV006,
    },
    {
      code: 'TS00003',
      name: 'Máy chiếu Epson EB-X51',
      categoryId: categories['Thiết bị dạy học'],
      supplierId: computers.id,
      serialNumber: 'X51-2023-0042',
      purchaseDate: monthsAgo(36),
      purchasePrice: 12_000_000,
      location: 'Phòng 6A1',
      custodianEmployeeId: employees.GV001,
    },
    {
      code: 'TS00004',
      name: 'Bảng tương tác 75 inch',
      categoryId: categories['Thiết bị dạy học'],
      supplierId: computers.id,
      serialNumber: 'IWB75-2025-0003',
      purchaseDate: monthsAgo(18),
      purchasePrice: 45_000_000,
      location: 'Phòng 7A1',
      custodianEmployeeId: employees.GV004,
      status: AssetStatus.UNDER_MAINTENANCE,
    },
    {
      code: 'TS00005',
      name: 'Bộ bàn ghế học sinh (40 bộ)',
      categoryId: categories['Bàn ghế'],
      supplierId: furniture.id,
      purchaseDate: monthsAgo(48),
      purchasePrice: 60_000_000,
      location: 'Phòng 6A2',
    },
    {
      code: 'TS00006',
      name: 'Bàn làm việc giáo viên',
      categoryId: categories['Bàn ghế'],
      supplierId: furniture.id,
      purchaseDate: monthsAgo(24),
      purchasePrice: 3_500_000,
      location: 'Kho',
      status: AssetStatus.IN_STORAGE,
    },
    {
      code: 'TS00007',
      name: 'Loa kéo di động Sony',
      categoryId: categories['Thiết bị dạy học'],
      supplierId: computers.id,
      serialNumber: 'SNY-2025-0088',
      purchaseDate: monthsAgo(12),
      purchasePrice: 6_800_000,
      location: 'Kho thiết bị',
      custodianEmployeeId: employees.GV007,
      status: AssetStatus.LENT,
    },
    {
      code: 'TS00008',
      name: 'Máy in Canon LBP2900',
      categoryId: categories['Máy tính'],
      supplierId: computers.id,
      serialNumber: 'CNL-2022-0009',
      purchaseDate: monthsAgo(48),
      purchasePrice: 3_200_000,
      location: 'Văn phòng',
      custodianEmployeeId: employees.NV001,
      status: AssetStatus.DISPOSED,
      disposedAt: daysFromNow(-30),
      notes: 'Hỏng trống mực, không sửa được',
    },
  ];
  for (const data of rows) {
    assets[data.code] = (await prisma.asset.create({ data: { ...data, schoolId } })).id;
  }

  await prisma.assetMaintenance.create({
    data: {
      assetId: assets.TS00004,
      date: daysFromNow(-5),
      description: 'Màn hình cảm ứng mất phản hồi, gửi bảo hành',
      cost: 0,
      vendor: 'Công ty CP Máy tính Hà Nội',
      nextDueDate: daysFromNow(360),
    },
  });

  await prisma.assetLoan.create({
    data: {
      schoolId,
      assetId: assets.TS00007,
      borrowerEmployeeId: employees.GV008,
      borrowerName: 'Bùi Thanh Hương',
      department: 'Tổ Nghệ thuật',
      lentAt: new Date(Date.now() - 3 * DAY_MS),
      dueAt: new Date(Date.now() + 4 * DAY_MS),
      note: 'Dùng cho buổi văn nghệ',
    },
  });

  await prisma.assetAudit.create({
    data: {
      schoolId,
      name: 'Kiểm kê học kỳ I',
      date: today(),
      status: AuditStatus.OPEN,
      items: {
        create: [
          { assetId: assets.TS00001, found: true, condition: 'Tốt' },
          { assetId: assets.TS00002, found: true, condition: 'Tốt' },
          { assetId: assets.TS00006, found: false, note: 'Không thấy trong kho, cần kiểm tra lại' },
        ],
      },
    },
  });
}
