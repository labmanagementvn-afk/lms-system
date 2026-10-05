import { CourseStatus, LessonType, LiveStatus, Prisma, PrismaClient, ProgressStatus, TestKind, TestStatus } from '@prisma/client';
import { localDate, zonedToUtc } from '../../src/common/time';
import { progressPercent } from '../../src/lms/progress';
import { SeedContext } from './context';

// Demo e-learning: three open courses with Vietnamese lessons, one draft, enrolments with
// deterministic progress, two discussion threads and three live rooms (ended / live / scheduled).

type LessonDef = { title: string; type: LessonType; content?: string; url?: string; durationMin?: number; isRequired?: boolean; quiz?: true };
type SectionDef = { title: string; lessons: LessonDef[] };
type CourseDef = { title: string; description: string; teacher: string; subject: string; classes: string[]; sections: SectionDef[] };

const p = (...paragraphs: string[]) => paragraphs.join('\n\n');

const COURSES: CourseDef[] = [
  {
    title: 'Toán 6 – Số tự nhiên và phân số',
    description: 'Ôn tập và mở rộng kiến thức về tập hợp số tự nhiên, lũy thừa và phân số theo chương trình Toán 6 (bộ Kết nối tri thức).',
    teacher: 'GV001',
    subject: 'TOAN',
    classes: ['6A1', '6A2'],
    sections: [
      {
        title: 'Chương 1: Tập hợp các số tự nhiên',
        lessons: [
          {
            title: 'Bài 1: Tập hợp và phần tử của tập hợp',
            type: LessonType.TEXT,
            durationMin: 15,
            content: p(
              'Trong toán học, tập hợp là một khái niệm cơ bản dùng để chỉ một nhóm các đối tượng xác định. Mỗi đối tượng trong nhóm gọi là một phần tử của tập hợp. Ví dụ: tập hợp các học sinh của lớp 6A1, tập hợp các chữ cái a, b, c hay tập hợp các số tự nhiên nhỏ hơn 5.',
              'Người ta thường đặt tên tập hợp bằng chữ cái in hoa như A, B, C và viết các phần tử trong dấu ngoặc nhọn, cách nhau bởi dấu chấm phẩy: A = {0; 1; 2; 3; 4}. Để chỉ 2 là phần tử của A ta viết 2 ∈ A, còn 7 không thuộc A ta viết 7 ∉ A.',
              'Có hai cách cho một tập hợp: liệt kê các phần tử hoặc chỉ ra tính chất đặc trưng của các phần tử. Chẳng hạn A = {x | x là số tự nhiên, x < 5} cũng chính là tập hợp A ở trên.',
            ),
          },
          { title: 'Video: Các phép tính với số tự nhiên', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=Z-lB4R2B8Bw', durationMin: 12 },
          {
            title: 'Bài 2: Lũy thừa với số mũ tự nhiên',
            type: LessonType.TEXT,
            durationMin: 15,
            content: p(
              'Lũy thừa bậc n của số a, kí hiệu aⁿ, là tích của n thừa số a: aⁿ = a · a · … · a (n thừa số, n ≠ 0). Số a gọi là cơ số, n gọi là số mũ. Ví dụ 2³ = 2 · 2 · 2 = 8 và 10⁴ = 10 000.',
              'Khi nhân hai lũy thừa cùng cơ số ta giữ nguyên cơ số và cộng các số mũ: aᵐ · aⁿ = aᵐ⁺ⁿ. Khi chia hai lũy thừa cùng cơ số (a ≠ 0, m ≥ n) ta giữ nguyên cơ số và trừ các số mũ: aᵐ : aⁿ = aᵐ⁻ⁿ.',
              'Thứ tự thực hiện phép tính trong biểu thức không có dấu ngoặc là: lũy thừa → nhân, chia → cộng, trừ. Với biểu thức có dấu ngoặc: ( ) → [ ] → { }.',
            ),
          },
        ],
      },
      {
        title: 'Chương 2: Phân số',
        lessons: [
          {
            title: 'Bài 3: Mở rộng khái niệm phân số',
            type: LessonType.TEXT,
            durationMin: 15,
            content: p(
              'Phân số có dạng a/b trong đó a, b là các số nguyên và b ≠ 0; a là tử số, b là mẫu số. Mọi số nguyên n đều viết được dưới dạng phân số n/1.',
              'Hai phân số a/b và c/d bằng nhau khi a · d = b · c. Khi nhân (hoặc chia) cả tử và mẫu của một phân số với cùng một số nguyên khác 0 ta được một phân số bằng phân số đã cho; đây là tính chất cơ bản của phân số dùng để rút gọn và quy đồng mẫu.',
            ),
          },
          { title: 'Video: So sánh và sắp xếp phân số', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=lfr5wQHbJ8M', durationMin: 10 },
          { title: 'Kiểm tra 15 phút: Số tự nhiên', type: LessonType.QUIZ, durationMin: 15, quiz: true },
        ],
      },
    ],
  },
  {
    title: 'Ngữ văn 6 – Truyện dân gian',
    description: 'Đọc hiểu các truyền thuyết và truyện cổ tích tiêu biểu: Thánh Gióng, Sơn Tinh Thủy Tinh, Thạch Sanh, Em bé thông minh.',
    teacher: 'GV002',
    subject: 'VAN',
    classes: ['6A1'],
    sections: [
      {
        title: 'Phần 1: Truyền thuyết',
        lessons: [
          {
            title: 'Thánh Gióng',
            type: LessonType.TEXT,
            durationMin: 20,
            content: p(
              'Truyền thuyết Thánh Gióng kể về cậu bé làng Gióng lên ba vẫn không biết nói, biết cười, nhưng khi nghe sứ giả tìm người đánh giặc Ân thì bỗng cất tiếng xin đi đánh giặc. Từ đó cậu lớn nhanh như thổi, cơm ăn mấy cũng không no, áo vừa mặc đã căng đứt chỉ; cả làng góp gạo nuôi cậu.',
              'Khi giặc đến chân núi Trâu, cậu bé vươn vai thành tráng sĩ, mặc áo giáp sắt, cưỡi ngựa sắt, cầm roi sắt xông ra trận. Roi gãy, tráng sĩ nhổ tre bên đường quật vào giặc. Giặc tan, tráng sĩ lên đỉnh núi Sóc, cởi áo giáp rồi cùng ngựa bay về trời.',
              'Hình tượng Thánh Gióng thể hiện sức mạnh của tinh thần đoàn kết chống giặc ngoại xâm và ước mơ về người anh hùng của nhân dân ta. Các chi tiết kì ảo (lớn nhanh như thổi, ngựa sắt phun lửa, bay về trời) làm tăng vẻ đẹp phi thường của nhân vật.',
            ),
          },
          {
            title: 'Sơn Tinh, Thủy Tinh',
            type: LessonType.TEXT,
            durationMin: 20,
            content: p(
              'Vua Hùng thứ mười tám có người con gái tên Mị Nương. Hai chàng Sơn Tinh (chúa vùng non cao) và Thủy Tinh (chúa vùng nước thẳm) cùng đến cầu hôn. Vua ra điều kiện ai mang sính lễ đến trước sẽ được cưới công chúa.',
              'Sơn Tinh đến trước và rước Mị Nương về núi. Thủy Tinh đến sau, nổi giận dâng nước đánh Sơn Tinh. Nước dâng cao bao nhiêu, núi dâng cao bấy nhiêu; cuối cùng Thủy Tinh kiệt sức rút quân. Từ đó năm nào Thủy Tinh cũng dâng nước đánh Sơn Tinh nhưng đều thua.',
              'Truyện giải thích hiện tượng lũ lụt hằng năm ở đồng bằng Bắc Bộ và thể hiện ước mơ chế ngự thiên tai của người Việt cổ.',
            ),
          },
        ],
      },
      {
        title: 'Phần 2: Truyện cổ tích',
        lessons: [
          {
            title: 'Thạch Sanh',
            type: LessonType.TEXT,
            durationMin: 20,
            content: p(
              'Thạch Sanh là chàng trai mồ côi sống dưới gốc đa, được thiên thần dạy võ nghệ và phép thần thông. Lý Thông lừa Thạch Sanh đi canh miếu thờ để thế mạng cho mình; Thạch Sanh giết chằn tinh, rồi lại bị Lý Thông cướp công.',
              'Chàng tiếp tục diệt đại bàng cứu công chúa, cứu con vua Thủy Tề, được tặng cây đàn thần. Bị vu oan, bị giam trong ngục, tiếng đàn của chàng khiến công chúa đang câm bỗng nói được; sự thật được sáng tỏ, mẹ con Lý Thông bị trừng phạt.',
              'Thạch Sanh dùng tiếng đàn và niêu cơm thần đẩy lùi quân mười tám nước chư hầu. Truyện thể hiện ước mơ về cái thiện thắng cái ác, về công lí và lòng nhân đạo của nhân dân.',
            ),
          },
          { title: 'Video: Kể chuyện Thạch Sanh', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=7KQjQ0G2b8E', durationMin: 10 },
          {
            title: 'Em bé thông minh (đọc thêm)',
            type: LessonType.TEXT,
            durationMin: 15,
            isRequired: false,
            content: p(
              'Truyện kể về một em bé nông dân thông minh đã bốn lần giải được những câu đố oái oăm của viên quan, của nhà vua và của sứ thần nước láng giềng, nhờ đó được phong làm trạng nguyên.',
              'Mỗi lần thử thách lại khó hơn lần trước, và em bé đều giải bằng kinh nghiệm đời sống dân gian chứ không bằng sách vở. Truyện đề cao trí khôn dân gian và tạo tiếng cười vui vẻ, hồn nhiên.',
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Tiếng Anh 6 – Unit 1–3',
    description: 'Từ vựng và ngữ pháp các Unit 1–3 (Global Success): My new school, My house, My friends.',
    teacher: 'GV003',
    subject: 'ANH',
    classes: ['6A1', '6A2'],
    sections: [
      {
        title: 'Unit 1: My new school',
        lessons: [
          {
            title: 'Vocabulary: School things',
            type: LessonType.TEXT,
            durationMin: 10,
            content: p(
              'Từ vựng cần nhớ: notebook (vở), compass (com-pa), calculator (máy tính), school bag (cặp sách), rubber (tẩy), pencil sharpener (gọt bút chì), textbook (sách giáo khoa), ruler (thước kẻ).',
              'Mẫu câu: "What do you have in your school bag?" – "I have a notebook, two pens and a calculator." Lưu ý dùng "a/an" với danh từ số ít đếm được và thêm "s" khi ở số nhiều.',
            ),
          },
          { title: 'Video: Present simple – thì hiện tại đơn', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=0Z6tz6Bmo5E', durationMin: 12 },
        ],
      },
      {
        title: 'Unit 2: My house',
        lessons: [
          {
            title: 'Vocabulary: Rooms and furniture',
            type: LessonType.TEXT,
            durationMin: 10,
            content: p(
              'Các phòng trong nhà: living room (phòng khách), kitchen (bếp), bedroom (phòng ngủ), bathroom (phòng tắm), hall (hành lang), attic (gác mái).',
              'Đồ đạc: sofa, lamp (đèn), wardrobe (tủ quần áo), chest of drawers (tủ ngăn kéo), fridge (tủ lạnh), sink (bồn rửa), dishwasher (máy rửa bát). Mẫu câu "There is a sofa in the living room. There are two lamps next to it."',
            ),
          },
          { title: 'Video: Prepositions of place', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=jXXcvs0Q_Ow', durationMin: 8 },
        ],
      },
      {
        title: 'Unit 3: My friends',
        lessons: [
          {
            title: 'Reading: My best friend',
            type: LessonType.TEXT,
            durationMin: 15,
            content: p(
              'My best friend is Mai. She is tall and slim with long black hair. She is kind and funny, and she always helps me with my homework. We both like reading comics and playing badminton after school.',
              'Từ vựng miêu tả ngoại hình: tall, short, slim, chubby, curly hair, straight hair. Tính cách: kind, funny, confident, creative, hard-working, friendly. Cấu trúc: "She has long hair." / "He is confident."',
            ),
          },
        ],
      },
    ],
  },
];

const DRAFT: CourseDef = {
  title: 'Khoa học tự nhiên 6 – Tế bào',
  description: 'Tế bào – đơn vị cơ bản của sự sống: cấu tạo, chức năng và sự lớn lên của tế bào.',
  teacher: 'GV004',
  subject: 'KHTN',
  classes: ['6A1'],
  sections: [
    {
      title: 'Chủ đề 1: Tế bào',
      lessons: [
        {
          title: 'Bài 1: Tế bào – đơn vị cơ bản của sự sống',
          type: LessonType.TEXT,
          durationMin: 15,
          content: p(
            'Mọi cơ thể sống đều được cấu tạo từ tế bào. Tế bào có kích thước rất nhỏ, phần lớn chỉ quan sát được bằng kính hiển vi; một số tế bào như tế bào trứng cá có thể nhìn thấy bằng mắt thường.',
            'Tế bào có ba thành phần chính: màng tế bào, tế bào chất và nhân (hoặc vùng nhân). Tế bào thực vật còn có thành tế bào và lục lạp.',
          ),
        },
        { title: 'Video: Quan sát tế bào dưới kính hiển vi', type: LessonType.LINK, url: 'https://www.youtube.com/watch?v=URUJD5NEXC8', durationMin: 8 },
      ],
    },
  ],
};

export async function seedLms(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, classes, teachers, teacherUsers, subjects, studentIds } = ctx;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true, code: true } });
  const tz = school.timezone;
  const now = new Date();
  const userOf = new Map((await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, userId: true } })).map((s) => [s.id, s.userId]));
  const quizTest = await prisma.test.findFirst({ where: { schoolId, kind: TestKind.QUIZ, status: TestStatus.PUBLISHED }, select: { id: true } });

  async function createCourse(def: CourseDef, status: CourseStatus) {
    const course = await prisma.course.create({
      data: {
        schoolId,
        academicYearId,
        subjectId: subjects[def.subject],
        gradeLevel: 6,
        teacherId: teachers[def.teacher],
        title: def.title,
        description: def.description,
        status,
        classIds: def.classes.map((c) => classes[c]),
      },
    });
    const sections = await prisma.courseSection.createManyAndReturn({
      data: def.sections.map((s, i) => ({ courseId: course.id, title: s.title, sortOrder: i })),
    });
    const lessonRows: Prisma.LessonCreateManyInput[] = [];
    def.sections.forEach((s, si) => {
      s.lessons
        .filter((l) => !l.quiz || quizTest)
        .forEach((l, li) =>
          lessonRows.push({
            schoolId,
            courseId: course.id,
            sectionId: sections[si].id,
            title: l.title,
            type: l.type,
            content: l.content,
            url: l.url,
            testId: l.quiz ? quizTest!.id : undefined,
            durationMin: l.durationMin,
            isRequired: l.isRequired ?? true,
            sortOrder: li,
          }),
        );
    });
    const lessons = await prisma.lesson.createManyAndReturn({ data: lessonRows });
    // createManyAndReturn keeps input order; sort defensively by section then position anyway.
    const order = new Map(sections.map((s, i) => [s.id, i]));
    lessons.sort((a, b) => order.get(a.sectionId!)! - order.get(b.sectionId!)! || a.sortOrder - b.sortOrder);
    return { course, lessons };
  }

  const built = [];
  for (const def of COURSES) built.push(await createCourse(def, CourseStatus.PUBLISHED));
  const [toan, van] = built;
  await createCourse(DRAFT, CourseStatus.DRAFT);
  if (quizTest) await prisma.test.update({ where: { id: quizTest.id }, data: { courseId: toan.course.id } });

  // ---- Enrolments with deterministic progress: 6A1 everywhere, 6A2 where the course is open to them ----
  const a1 = studentIds.slice(0, 10);
  const a2 = studentIds.slice(10, 20);
  const enrolments: Prisma.CourseEnrollmentCreateManyInput[] = [];
  const progress: Prisma.LessonProgressCreateManyInput[] = [];
  built.forEach(({ course, lessons }, ci) => {
    const roster = course.classIds.includes(classes['6A2']) ? [...a1, ...a2] : a1;
    const required = lessons.filter((l) => l.isRequired);
    roster.forEach((studentId, i) => {
      // How far this student got: 0 .. every lesson, varying by student and course.
      const done = Math.min(lessons.length, (i * 3 + ci * 2) % (lessons.length + 2));
      let lastAt: Date | null = null;
      lessons.forEach((lesson, j) => {
        if (j > done) return;
        const completed = j < done;
        const at = new Date(now.getTime() - (((i * 5 + j) % 12) * 24 + (j % 5)) * 3_600_000);
        if (!lastAt || at > lastAt) lastAt = at;
        progress.push({
          lessonId: lesson.id,
          studentId,
          status: completed ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
          secondsSpent: completed ? (lesson.durationMin ?? 10) * 60 + ((i * 37 + j * 11) % 180) : Math.round(((lesson.durationMin ?? 10) * 60) / 3),
          completedAt: completed ? at : null,
          lastAt: at,
        });
      });
      const doneRequired = lessons.slice(0, done).filter((l) => l.isRequired).length;
      const pct = progressPercent(doneRequired, required.length);
      enrolments.push({
        courseId: course.id,
        studentId,
        enrolledAt: new Date(now.getTime() - 14 * 86_400_000),
        progressPct: pct,
        completedAt: pct === 100 ? lastAt : null,
      });
    });
  });
  await prisma.courseEnrollment.createMany({ data: enrolments });
  await prisma.lessonProgress.createMany({ data: progress });

  // ---- Two discussion threads ----
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const thread1 = await prisma.discussionThread.create({
    data: {
      schoolId,
      courseId: toan.course.id,
      lessonId: toan.lessons[0].id,
      authorId: teacherUsers.GV001,
      title: 'Hỏi đáp chương 1: Số tự nhiên',
      body: 'Các em có thắc mắc gì về bài 1 và bài 2 thì hỏi tại đây nhé. Cô sẽ trả lời trong ngày.',
      isPinned: true,
      createdAt: hoursAgo(50),
      posts: {
        create: [
          { authorId: userOf.get(a1[0])!, body: 'Cô ơi, tập hợp rỗng có phải là tập hợp không ạ?', createdAt: hoursAgo(40) },
          { authorId: teacherUsers.GV001, body: 'Có em nhé. Tập hợp rỗng là tập hợp không có phần tử nào, kí hiệu là ∅.', createdAt: hoursAgo(38) },
          { authorId: userOf.get(a1[2])!, body: 'Em cảm ơn cô, em hiểu rồi ạ.', createdAt: hoursAgo(30) },
        ],
      },
    },
  });
  await prisma.discussionThread.create({
    data: {
      schoolId,
      courseId: van.course.id,
      lessonId: van.lessons[0].id,
      authorId: userOf.get(a1[1])!,
      title: 'Ý nghĩa chi tiết Thánh Gióng bay về trời?',
      body: 'Thầy ơi, vì sao Thánh Gióng không ở lại nhận thưởng mà lại bay về trời ạ?',
      createdAt: hoursAgo(20),
      posts: {
        create: [
          {
            authorId: teacherUsers.GV002,
            body: 'Chi tiết này cho thấy người anh hùng đánh giặc vì nghĩa lớn chứ không vì danh lợi, và cũng là cách nhân dân bất tử hóa người anh hùng em ạ.',
            createdAt: hoursAgo(18),
          },
          { authorId: userOf.get(a1[3])!, body: 'Em thấy chi tiết này rất đẹp, giống như Gióng là người của trời xuống giúp dân.', createdAt: hoursAgo(10) },
        ],
      },
    },
  });

  // ---- Live rooms of the maths course: one ended yesterday, one running now, one tomorrow evening ----
  const room = (n: string) => `lms-${school.code.toLowerCase()}-${n.padStart(10, '0')}`;
  const yesterday = localDate(new Date(now.getTime() - 86_400_000), tz);
  const tomorrow = localDate(new Date(now.getTime() + 86_400_000), tz);
  const endedStart = zonedToUtc(`${yesterday} 19:30`, tz);
  const endedEnd = new Date(endedStart.getTime() + 45 * 60_000);
  await prisma.liveSession.create({
    data: {
      schoolId,
      courseId: toan.course.id,
      title: 'Ôn tập chương 1: Số tự nhiên',
      startsAt: endedStart,
      durationMin: 45,
      roomName: room('ontap1'),
      status: LiveStatus.ENDED,
      startedAt: endedStart,
      endedAt: endedEnd,
      createdById: teacherUsers.GV001,
      attendances: {
        create: a1.slice(0, 8).map((studentId, i) => ({
          studentId,
          joinedAt: new Date(endedStart.getTime() + i * 60_000),
          leftAt: new Date(endedEnd.getTime() - (i % 3) * 120_000),
        })),
      },
    },
  });
  await prisma.liveSession.create({
    data: {
      schoolId,
      courseId: toan.course.id,
      title: 'Chữa bài tập phân số',
      startsAt: new Date(now.getTime() - 5 * 60_000),
      durationMin: 45,
      roomName: room('phanso1'),
      status: LiveStatus.LIVE,
      startedAt: new Date(now.getTime() - 4 * 60_000),
      createdById: teacherUsers.GV001,
      attendances: { create: a1.slice(0, 3).map((studentId, i) => ({ studentId, joinedAt: new Date(now.getTime() - (3 - i) * 60_000) })) },
    },
  });
  await prisma.liveSession.create({
    data: {
      schoolId,
      courseId: toan.course.id,
      title: 'Luyện đề kiểm tra giữa kỳ',
      startsAt: zonedToUtc(`${tomorrow} 19:30`, tz),
      durationMin: 60,
      roomName: room('giuaky1'),
      createdById: teacherUsers.GV001,
    },
  });

  console.log(`  LMS: ${built.length} published courses + 1 draft, ${enrolments.length} enrolments, ${progress.length} progress rows, 2 threads (first: ${thread1.title}), 3 live rooms`);
}
