// Texts for the answers of POST /api/bookings and of the price preview. Kept in one place for every screen.
export const BOOKING_API_MESSAGES: Record<string, string> = {
  unauthenticated: "Please log in to book.",
  forbidden: "This account cannot make bookings.",
  own_vehicle: "You cannot book your own vehicle.",
  email_mismatch: "The email must be the one of your account.",
  start_in_past: "The start must be in the future (Bucharest time).",
  vehicle_unavailable: "This vehicle is not available for booking.",
  pending_limit: "You already have 3 bookings waiting for confirmation. Wait until they are confirmed, or cancel one, before booking again.",
  conflict: "The vehicle is already booked for part of that period. Pick other times.",
  invalid_input: "Check the dates and the contact details.",
};

export const PRICE_REASONS: Record<string, string> = {
  invalid_dates: "Enter a valid start and end.",
  end_before_start: "The end must be after the start.",
  too_long: "A single booking can last up to 60 days.",
  start_in_past: "The start must be in the future (Bucharest time).",
  vehicle_unavailable: "This vehicle is not available for booking.",
};
