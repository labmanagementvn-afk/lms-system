// Vietnamese labels for API enums.

export const ROLE: Record<string, string> = { ADMIN: 'Quản trị', STAFF: 'Nhân viên', TEACHER: 'Giáo viên', PARENT: 'Phụ huynh', DRIVER: 'Lái xe', STUDENT: 'Học sinh', DISTRICT: 'Phòng/Sở GD&ĐT' };
export const GENDER: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
export const TEACHER_STATUS: Record<string, string> = { ACTIVE: 'Đang công tác', ON_LEAVE: 'Tạm nghỉ', RESIGNED: 'Đã nghỉ việc' };
export const STUDENT_STATUS: Record<string, string> = {
  STUDYING: 'Đang học',
  TRANSFERRED: 'Chuyển trường',
  DROPPED: 'Thôi học',
  GRADUATED: 'Đã tốt nghiệp',
};
export const RELATIONSHIP: Record<string, string> = { FATHER: 'Cha', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ', OTHER: 'Khác' };
export const SESSION: Record<string, string> = { MORNING: 'Sáng', AFTERNOON: 'Chiều' };
export const DAY: Record<number, string> = { 1: 'Thứ Hai', 2: 'Thứ Ba', 3: 'Thứ Tư', 4: 'Thứ Năm', 5: 'Thứ Sáu', 6: 'Thứ Bảy', 7: 'Chủ Nhật' };
export const DEVICE_TYPE: Record<string, string> = {
  FACE: 'Nhận diện khuôn mặt',
  FINGERPRINT: 'Vân tay',
  CARD: 'Đọc thẻ',
  QR: 'Mã QR',
  MULTI: 'Đa phương thức',
};
export const IDENTITY_METHOD: Record<string, string> = { BIOMETRIC: 'Sinh trắc học (khuôn mặt/vân tay)', CARD: 'Thẻ', QR: 'Mã QR' };
export const EVENT_METHOD: Record<string, string> = {
  FACE: 'Khuôn mặt',
  FINGERPRINT: 'Vân tay',
  CARD: 'Thẻ',
  QR: 'QR',
  MANUAL: 'Thủ công',
  UNKNOWN: 'Không rõ',
};
export const DIRECTION: Record<string, string> = { IN: 'Vào', OUT: 'Ra', UNKNOWN: 'Không rõ' };
export const DAY_STATUS: Record<string, { label: string; color: string }> = {
  ON_TIME: { label: 'Đúng giờ', color: 'green' },
  LATE: { label: 'Đi muộn', color: 'orange' },
  ABSENT: { label: 'Vắng', color: 'red' },
};

// ---- Phase 2 ----

export const FEE_UNIT: Record<string, string> = { MONTH: 'Tháng', TERM: 'Học kỳ', YEAR: 'Năm học', ONCE: 'Một lần' };
export const DISCOUNT_KIND: Record<string, string> = { PERCENT: 'Phần trăm', AMOUNT: 'Số tiền' };
export const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  PUBLISHED: { label: 'Đã phát hành', color: 'blue' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
};
export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  UNPAID: { label: 'Chưa thu', color: 'red' },
  PARTIAL: { label: 'Thu một phần', color: 'orange' },
  PAID: { label: 'Đã thu đủ', color: 'green' },
  CARRIED_OVER: { label: 'Chuyển nợ kỳ sau', color: 'purple' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};
export const INVOICE_SOURCE: Record<string, string> = { CAMPAIGN: 'Đợt thu', STORE: 'Cấp phát', MANUAL: 'Thủ công' };
export const PAYMENT_METHOD: Record<string, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', QR: 'QR ngân hàng' };
export const BANK_TXN_STATUS: Record<string, { label: string; color: string }> = {
  MATCHED: { label: 'Đã khớp', color: 'green' },
  UNMATCHED: { label: 'Chưa khớp', color: 'orange' },
  IGNORED: { label: 'Bỏ qua', color: 'default' },
};
export const SYNC_KIND: Record<string, string> = {
  RECEIPT: 'Phiếu thu',
  RECEIPT_VOID: 'Hủy phiếu thu',
  STOCK_IN: 'Phiếu nhập kho',
  STOCK_OUT: 'Phiếu xuất kho',
};
export const SYNC_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ đồng bộ', color: 'blue' },
  SUCCESS: { label: 'Thành công', color: 'green' },
  FAILED: { label: 'Lỗi', color: 'red' },
};
export const ITEM_CATEGORY: Record<string, string> = { UNIFORM: 'Đồng phục', BOOK: 'Sách vở', EQUIPMENT: 'Dụng cụ', OTHER: 'Khác' };
export const STOCK_MOVEMENT: Record<string, string> = { IN: 'Nhập kho', OUT: 'Xuất kho', ADJUST: 'Điều chỉnh' };
export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ cấp phát', color: 'blue' },
  ISSUED: { label: 'Đã cấp phát', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};
export const MEAL_TYPE: Record<string, string> = { BREAKFAST: 'Bữa sáng', LUNCH: 'Bữa trưa', SNACK: 'Bữa phụ' };
export const COPY_STATUS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Sẵn sàng', color: 'green' },
  BORROWED: { label: 'Đang mượn', color: 'blue' },
  LOST: { label: 'Mất', color: 'red' },
  RETIRED: { label: 'Thanh lý', color: 'default' },
};
export const RESERVATION_STATUS: Record<string, string> = { ACTIVE: 'Đang giữ chỗ', FULFILLED: 'Đã mượn', CANCELLED: 'Đã hủy' };
export const INCIDENT_SEVERITY: Record<string, { label: string; color: string }> = {
  MINOR: { label: 'Nhẹ', color: 'green' },
  MODERATE: { label: 'Trung bình', color: 'orange' },
  SERIOUS: { label: 'Nghiêm trọng', color: 'red' },
};

// ---- Phase 3 ----

export const NOTIFICATION_KIND: Record<string, string> = {
  GATE_IN: 'Đến trường',
  GATE_OUT: 'Rời trường',
  HOMEROOM_ABSENT: 'Vắng mặt',
  HOMEROOM_LATE: 'Đi muộn',
  BUS_BOARD: 'Lên xe',
  BUS_ALIGHT: 'Xuống xe',
  INVOICE_ISSUED: 'Khoản thu mới',
  PAYMENT_RECEIVED: 'Đã nhận thanh toán',
  HEALTH_INCIDENT: 'Sự cố y tế',
  LEAVE_DECIDED: 'Đơn nghỉ phép',
  ABSENCE_REQUEST: 'Đơn xin nghỉ học',
  ABSENCE_DECIDED: 'Đơn xin nghỉ học',
  STUDENT_AWARD: 'Khen thưởng',
  STUDENT_DISCIPLINE: 'Kỷ luật',
  ANNOUNCEMENT: 'Thông báo',
  EVENT: 'Sự kiện',
  SYSTEM: 'Hệ thống',
};
export const NOTIFICATION_CHANNEL: Record<string, string> = { IN_APP: 'Trong ứng dụng', PUSH: 'Push (điện thoại)', ZALO: 'Zalo ZNS', SMS: 'SMS', EMAIL: 'Email' };
export const ANNOUNCEMENT_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  SCHEDULED: { label: 'Hẹn giờ gửi', color: 'blue' },
  SENT: { label: 'Đã gửi', color: 'green' },
};
export const RSVP: Record<string, { label: string; color: string }> = {
  GOING: { label: 'Tham dự', color: 'green' },
  NOT_GOING: { label: 'Không tham dự', color: 'red' },
  MAYBE: { label: 'Chưa chắc', color: 'orange' },
};
export const HOMEROOM_STATUS: Record<string, { label: string; color: string }> = {
  PRESENT: { label: 'Có mặt', color: 'green' },
  ABSENT: { label: 'Vắng', color: 'red' },
  LATE: { label: 'Đi muộn', color: 'orange' },
  EXCUSED: { label: 'Vắng có phép', color: 'blue' },
};
export const LESSON_LOG_STATUS: Record<string, { label: string; color: string }> = {
  DONE: { label: 'Đã dạy', color: 'green' },
  CANCELLED: { label: 'Nghỉ tiết', color: 'default' },
};
export const VEHICLE_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang hoạt động', color: 'green' },
  MAINTENANCE: { label: 'Bảo dưỡng', color: 'orange' },
  RETIRED: { label: 'Ngừng sử dụng', color: 'default' },
};
export const BUS_STAFF_ROLE: Record<string, string> = { DRIVER: 'Lái xe', MONITOR: 'Phụ xe' };
export const BUS_DIRECTION: Record<string, string> = { PICKUP: 'Đón (sáng)', DROPOFF: 'Trả (chiều)' };
export const BUS_TRIP_STATUS: Record<string, { label: string; color: string }> = {
  PLANNED: { label: 'Chưa chạy', color: 'default' },
  RUNNING: { label: 'Đang chạy', color: 'blue' },
  DONE: { label: 'Hoàn thành', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'red' },
};
export const BOARDING_TYPE: Record<string, string> = { BOARD: 'Lên xe', ALIGHT: 'Xuống xe' };
export const ADMISSION_ROUND_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Đang mở', color: 'green' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
};
export const APPLICATION_STATUS: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: 'Mới nộp', color: 'blue' },
  SCREENING: { label: 'Đang xét', color: 'orange' },
  ACCEPTED: { label: 'Trúng tuyển', color: 'green' },
  REJECTED: { label: 'Không đạt', color: 'red' },
  ENROLLED: { label: 'Đã nhập học', color: 'purple' },
  WITHDRAWN: { label: 'Rút hồ sơ', color: 'default' },
};
export const APPLICATION_SOURCE: Record<string, string> = { ONLINE: 'Trực tuyến', IMPORT: 'Nhập từ file', MANUAL: 'Nhập tay' };
export const REGISTRATION_STATUS: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: 'Đã gửi', color: 'blue' },
  CONFIRMED: { label: 'Đã xác nhận', color: 'green' },
};
export const EMPLOYMENT_TYPE: Record<string, string> = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', CONTRACT: 'Hợp đồng', PROBATION: 'Thử việc' };
export const EMPLOYEE_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang làm việc', color: 'green' },
  ON_LEAVE: { label: 'Tạm nghỉ', color: 'orange' },
  RESIGNED: { label: 'Đã nghỉ việc', color: 'default' },
  RETIRED: { label: 'Nghỉ hưu', color: 'default' },
};
export const EMPLOYEE_DOCUMENT_KIND: Record<string, string> = { DEGREE: 'Bằng cấp', CERTIFICATE: 'Chứng chỉ', LICENSE: 'Giấy phép', OTHER: 'Khác' };
export const LEAVE_TYPE: Record<string, string> = { ANNUAL: 'Nghỉ phép năm', SICK: 'Nghỉ ốm', UNPAID: 'Nghỉ không lương', MATERNITY: 'Thai sản', OTHER: 'Khác' };
export const LEAVE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'blue' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Từ chối', color: 'red' },
};
export const ASSET_STATUS: Record<string, { label: string; color: string }> = {
  IN_USE: { label: 'Đang sử dụng', color: 'green' },
  IN_STORAGE: { label: 'Trong kho', color: 'default' },
  UNDER_MAINTENANCE: { label: 'Đang sửa chữa', color: 'orange' },
  LENT: { label: 'Cho mượn', color: 'blue' },
  DISPOSED: { label: 'Đã thanh lý', color: 'red' },
};
export const AUDIT_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Đang kiểm kê', color: 'blue' },
  CLOSED: { label: 'Đã chốt', color: 'green' },
};

// ---- Phase 4 ----

export const ASSESSMENT_TYPE: Record<string, string> = { SCORE: 'Bằng điểm số', COMMENT: 'Bằng nhận xét' };
export const SCORE_KIND: Record<string, string> = { TX: 'Thường xuyên', GK: 'Giữa kỳ', CK: 'Cuối kỳ' };
export const SEMESTER: Record<number, string> = { 1: 'Học kỳ 1', 2: 'Học kỳ 2', 0: 'Cả năm' };
export const RESULT_LEVEL: Record<string, { label: string; color: string }> = {
  TOT: { label: 'Tốt', color: 'green' },
  KHA: { label: 'Khá', color: 'blue' },
  DAT: { label: 'Đạt', color: 'orange' },
  CHUA_DAT: { label: 'Chưa đạt', color: 'red' },
};
export const PROMOTION_STATUS: Record<string, { label: string; color: string }> = {
  PROMOTED: { label: 'Được lên lớp', color: 'green' },
  RETEST: { label: 'Kiểm tra lại', color: 'orange' },
  RETAINED: { label: 'Ở lại lớp', color: 'red' },
};
export const CONDUCT_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Chưa đánh giá', color: 'default' },
  SELF_ASSESSED: { label: 'HS đã tự đánh giá', color: 'blue' },
  REVIEWED: { label: 'GVCN đã đánh giá', color: 'orange' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
};
export const COURSE_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  PUBLISHED: { label: 'Đang mở', color: 'green' },
  ARCHIVED: { label: 'Đã lưu trữ', color: 'default' },
};
export const LESSON_TYPE: Record<string, string> = {
  VIDEO: 'Video',
  DOCUMENT: 'Tài liệu',
  SCORM: 'Gói SCORM',
  H5P: 'H5P',
  TEXT: 'Bài đọc',
  LINK: 'Liên kết',
  QUIZ: 'Bài kiểm tra',
};
export const PROGRESS_STATUS: Record<string, { label: string; color: string }> = {
  NOT_STARTED: { label: 'Chưa học', color: 'default' },
  IN_PROGRESS: { label: 'Đang học', color: 'blue' },
  COMPLETED: { label: 'Hoàn thành', color: 'green' },
};
export const LIVE_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Sắp diễn ra', color: 'blue' },
  LIVE: { label: 'Đang diễn ra', color: 'red' },
  ENDED: { label: 'Đã kết thúc', color: 'default' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};
export const QUESTION_TYPE: Record<string, string> = {
  SINGLE_CHOICE: 'Một lựa chọn',
  MULTIPLE_CHOICE: 'Nhiều lựa chọn',
  TRUE_FALSE: 'Đúng / Sai',
  FILL_BLANK: 'Điền vào chỗ trống',
  SHORT_ANSWER: 'Trả lời ngắn',
  NUMERIC: 'Kết quả số',
  MATCHING: 'Ghép đôi',
  ORDERING: 'Sắp xếp',
  ESSAY: 'Tự luận',
};
export const DIFFICULTY: Record<number, string> = { 1: 'Nhận biết', 2: 'Thông hiểu', 3: 'Vận dụng', 4: 'Vận dụng cao', 5: 'Phân tích', 6: 'Sáng tạo' };
export const TEST_KIND: Record<string, string> = { PRACTICE: 'Luyện tập', QUIZ: 'Bài kiểm tra', EXAM: 'Bài thi', CONTEST: 'Cuộc thi' };
export const TEST_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  PUBLISHED: { label: 'Đã giao', color: 'green' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
};
export const ATTEMPT_STATUS: Record<string, { label: string; color: string }> = {
  IN_PROGRESS: { label: 'Đang làm', color: 'blue' },
  SUBMITTED: { label: 'Chờ chấm', color: 'orange' },
  GRADED: { label: 'Đã chấm', color: 'green' },
};

/** 1500000 -> "1.500.000 ₫" */
export const vnd = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('vi-VN')} ₫`;

export const options = (map: Record<string | number, string>) =>
  Object.entries(map).map(([value, label]) => ({ value: isNaN(Number(value)) ? value : Number(value), label }));

// ---- Phase 5: district, statistics, alerts, MOET exchange, audit ----
export const DISTRICT_LEVEL: Record<string, string> = { PHONG: 'Phòng GD&ĐT', SO: 'Sở GD&ĐT' };
export const ALERT_KIND: Record<string, { label: string; unit: string; hint: string }> = {
  ATTENDANCE_RATE_BELOW: { label: 'Chuyên cần thấp hơn', unit: '%', hint: 'Tỷ lệ học sinh có mặt trong ngày thấp hơn ngưỡng' },
  LATE_RATE_ABOVE: { label: 'Đi muộn vượt', unit: '%', hint: 'Tỷ lệ học sinh vào trường sau giờ quy định vượt ngưỡng' },
  OVERDUE_FEES_ABOVE: { label: 'Công nợ quá hạn vượt', unit: '₫', hint: 'Tổng tiền chưa thu của các khoản đã quá hạn vượt ngưỡng' },
  HEALTH_INCIDENTS_ABOVE: { label: 'Sự cố y tế vượt', unit: 'sự cố/ngày', hint: 'Số sự cố y tế ghi nhận trong ngày vượt ngưỡng' },
  ABSENT_STREAK: { label: 'Vắng liên tiếp', unit: 'ngày học', hint: 'Có học sinh vắng đủ số ngày học liên tiếp (không tính Chủ nhật)' },
};
export const MOET_EXPORT_KIND: Record<string, { label: string; hint: string }> = {
  STUDENTS: { label: 'Danh sách học sinh', hint: 'Mã, họ tên, ngày sinh, giới tính, lớp, trạng thái, người giám hộ' },
  TEACHERS: { label: 'Danh sách giáo viên', hint: 'Mã, họ tên, ngày sinh, liên hệ, trạng thái, môn giảng dạy' },
  CLASSES: { label: 'Danh sách lớp', hint: 'Lớp, khối, phòng, giáo viên chủ nhiệm, sĩ số của năm học' },
  TERM_RESULTS: { label: 'Kết quả học kỳ', hint: 'Xếp loại học tập, rèn luyện, danh hiệu, lên lớp và điểm trung bình các môn' },
};
export const MOET_TARGET: Record<string, string> = { MOET: 'CSDL ngành (Bộ GD&ĐT)', PROVINCE: 'CSDL Sở GD&ĐT' };
export const MOET_SYNC_STATUS: Record<string, { label: string; color: string }> = {
  SUCCESS: { label: 'Thành công', color: 'green' },
  PARTIAL: { label: 'Nhận một phần', color: 'gold' },
  FAILED: { label: 'Thất bại', color: 'red' },
};
export const MOET_EXPORT_STATUS: Record<string, { label: string; color: string }> = { DONE: { label: 'Hoàn tất', color: 'green' }, FAILED: { label: 'Lỗi', color: 'red' } };
export const ERECORD_STATUS: Record<string, { label: string; color: string }> = {
  NONE: { label: 'Chưa tạo', color: 'default' },
  DRAFT: { label: 'Chờ GVCN ký', color: 'blue' },
  HOMEROOM_SIGNED: { label: 'Chờ Hiệu trưởng ký', color: 'gold' },
  ISSUED: { label: 'Đã phát hành', color: 'green' },
  REVOKED: { label: 'Đã thu hồi', color: 'red' },
};
export const SIGNATURE_PROVIDER: Record<string, string> = { VNPT_SMARTCA: 'VNPT SmartCA', VIETTEL_MYSIGN: 'Viettel MySign' };
export const SMS_AUDIENCE: Record<string, string> = { PARENT: 'Phụ huynh', TEACHER: 'Giáo viên' };
export const SMS_CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Hẹn giờ', color: 'blue' },
  SENDING: { label: 'Đang gửi', color: 'gold' },
  SENT: { label: 'Đã gửi', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};
export const SMS_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Đang chờ', color: 'blue' },
  SUCCESS: { label: 'Thành công', color: 'green' },
  FAILED: { label: 'Lỗi', color: 'red' },
};
export const HTTP_METHOD: Record<string, { label: string; color: string }> = {
  POST: { label: 'Tạo', color: 'green' },
  PUT: { label: 'Ghi', color: 'blue' },
  PATCH: { label: 'Sửa', color: 'gold' },
  DELETE: { label: 'Xóa', color: 'red' },
};
export const AREA: Record<string, string> = {
  auth: 'Đăng nhập',
  teachers: 'Giáo viên',
  students: 'Học sinh',
  classes: 'Lớp học',
  subjects: 'Môn học',
  'academic-years': 'Năm học',
  schedules: 'Thời khóa biểu',
  attendance: 'Điểm danh',
  homeroom: 'Chủ nhiệm',
  finance: 'Học phí',
  store: 'Cấp phát',
  canteen: 'Bán trú',
  library: 'Thư viện',
  health: 'Y tế',
  notifications: 'Thông báo',
  announcements: 'Thông báo & sự kiện',
  parents: 'Phụ huynh',
  bus: 'Xe đưa đón',
  admissions: 'Tuyển sinh',
  hr: 'Nhân sự',
  assets: 'Tài sản',
  grades: 'Sổ điểm',
  conduct: 'Rèn luyện',
  lms: 'E-learning',
  uploads: 'Tệp tin',
  stats: 'Thống kê',
  alerts: 'Cảnh báo',
  school: 'Thiết lập trường',
  moet: 'CSDL ngành',
  district: 'Phòng/Sở',
  audit: 'Nhật ký',
  sms: 'Tin nhắn SMS',
};

// ---- Phase 9: student records ----
export const POLICY_GROUP: Record<string, string> = {
  MARTYR_CHILD: 'Con liệt sĩ',
  WAR_INVALID_CHILD: 'Con thương binh, bệnh binh',
  POOR_HOUSEHOLD: 'Hộ nghèo',
  NEAR_POOR_HOUSEHOLD: 'Hộ cận nghèo',
  HARDSHIP_AREA: 'Vùng đặc biệt khó khăn',
  DISABILITY: 'Khuyết tật',
  ORPHAN: 'Mồ côi',
};
export const MOVEMENT_KIND: Record<string, { label: string; color: string }> = {
  ENROLLED: { label: 'Tuyển mới', color: 'green' },
  TRANSFER_IN: { label: 'Chuyển đến', color: 'cyan' },
  CLASS_CHANGE: { label: 'Chuyển lớp', color: 'blue' },
  TRANSFER_OUT: { label: 'Chuyển đi', color: 'orange' },
  DROPPED: { label: 'Thôi học', color: 'red' },
  RETURNED: { label: 'Trở lại học', color: 'purple' },
};
/** Thông tư 19/2025/TT-BGDĐT, Điều 5. */
export const AWARD_FORM: Record<string, string> = {
  CLASS_PRAISE: 'Tuyên dương trước lớp',
  SCHOOL_PRAISE: 'Tuyên dương trước toàn trường',
  PRINCIPAL_CERTIFICATE: 'Giấy khen của Hiệu trưởng',
  LETTER: 'Thư khen',
  OTHER: 'Hình thức khen thưởng khác',
};
/** Thông tư 19/2025/TT-BGDĐT, Điều 13: primary pupils get a reminder or an apology, older students a reminder, criticism or a self-review. */
export const DISCIPLINE_MEASURE: Record<string, { label: string; color: string; primary: boolean }> = {
  REMINDER: { label: 'Nhắc nhở', color: 'gold', primary: true },
  APOLOGY: { label: 'Yêu cầu xin lỗi', color: 'orange', primary: true },
  CRITICISM: { label: 'Phê bình', color: 'volcano', primary: false },
  SELF_REVIEW: { label: 'Yêu cầu viết bản tự kiểm điểm', color: 'red', primary: false },
};
/** Điều 12: how far the violation reaches. */
export const SEVERITY: Record<number, string> = {
  1: 'Mức độ 1: có tác hại đến bản thân học sinh',
  2: 'Mức độ 2: ảnh hưởng tiêu cực trong nhóm, lớp',
  3: 'Mức độ 3: ảnh hưởng tiêu cực trong nhà trường',
};
export const ABSENCE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Không duyệt', color: 'red' },
  CANCELLED: { label: 'Đã rút', color: 'default' },
};

/** "2026-10-12" -> "12/10/2026" */
export const dmy = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '');

/** "Sáng 12/10/2026" or "12/10/2026 – 14/10/2026 (cả ngày)". */
export function leaveDays(r: { fromDate: string; toDate: string; session: string | null }) {
  const days = r.fromDate === r.toDate ? dmy(r.fromDate) : `${dmy(r.fromDate)} – ${dmy(r.toDate)}`;
  return r.session ? `${SESSION[r.session]} ${days}` : `${days} (cả ngày)`;
}

// ---- Phase 10: phân công chuyên môn, kiêm nhiệm, định mức tiết dạy, lịch báo giảng, sổ chủ nhiệm ----

export const DUTY_KIND: Record<string, { label: string; color: string }> = {
  POSITION: { label: 'Chức vụ', color: 'purple' },
  CONCURRENT: { label: 'Kiêm nhiệm', color: 'blue' },
  OTHER: { label: 'Chế độ khác', color: 'default' },
};
export const NOTE_KIND: Record<string, { label: string; color: string }> = {
  ATTENTION: { label: 'Cần quan tâm, giúp đỡ', color: 'orange' },
  OUTSTANDING: { label: 'Có thành tích nổi bật', color: 'green' },
  PROGRESS: { label: 'Có tiến bộ', color: 'blue' },
  OTHER: { label: 'Khác', color: 'default' },
};
/** Ban cán sự lớp, Ban chỉ huy chi đội and Ban đại diện cha mẹ học sinh roles to pick from (any other may be typed). */
export const OFFICER_ROLES = ['Lớp trưởng', 'Lớp phó học tập', 'Lớp phó văn thể mỹ', 'Lớp phó lao động', 'Lớp phó kỷ luật', 'Thủ quỹ', 'Chi đội trưởng', 'Chi đội phó', 'Bí thư chi đoàn', 'Phó bí thư chi đoàn'];
export const COMMITTEE_ROLES = ['Trưởng ban', 'Phó trưởng ban', 'Ủy viên'];
/** "4", "1,5": periods with a decimal comma. */
export const periods = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 10) / 10).replace('.', ','));
