// Vietnamese labels for API enums.

export const ROLE: Record<string, string> = { ADMIN: 'Quản trị', STAFF: 'Nhân viên', TEACHER: 'Giáo viên' };
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

/** 1500000 -> "1.500.000 ₫" */
export const vnd = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('vi-VN')} ₫`;

export const options = (map: Record<string | number, string>) =>
  Object.entries(map).map(([value, label]) => ({ value: isNaN(Number(value)) ? value : Number(value), label }));
