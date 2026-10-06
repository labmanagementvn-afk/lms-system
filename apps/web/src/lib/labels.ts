// Vietnamese labels for API enums.

export const ROLE: Record<string, string> = { ADMIN: 'Quản trị', STAFF: 'Nhân viên', TEACHER: 'Giáo viên', PARENT: 'Phụ huynh', DRIVER: 'Lái xe', STUDENT: 'Học sinh' };
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
