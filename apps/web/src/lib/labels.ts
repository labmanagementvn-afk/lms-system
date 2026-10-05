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

export const options = (map: Record<string | number, string>) =>
  Object.entries(map).map(([value, label]) => ({ value: isNaN(Number(value)) ? value : Number(value), label }));
