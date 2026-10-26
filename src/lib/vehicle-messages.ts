// Texts for the notices shown after the vehicle actions (query parameters ?ok=... and ?error=...).
export const VEHICLE_OK: Record<string, string> = {
  created: "The vehicle was created. Add some photos next.",
  created_photos: "The vehicle was created with its photos.",
  saved: "The details were saved.",
  saved_review: "The details were saved. Because the public text changed, the listing is awaiting approval again.",
  photos: "The photos were uploaded.",
  photos_review: "The photos were uploaded. The listing is awaiting approval again, because new photos are reviewed.",
  photo_deleted: "The photo was removed.",
  cover: "The cover photo was changed.",
  maintenance: "The maintenance record was added.",
  maintenance_updated: "The maintenance record was saved.",
  maintenance_deleted: "The maintenance record was removed.",
  resubmitted: "The listing was sent for approval again.",
};

export const VEHICLE_ERROR: Record<string, string> = {
  invalid: "Check the fields: name 3 to 80 characters, prices above zero, a location, and numbers within sensible limits.",
  plate: "A vehicle with this plate number already exists.",
  category: "That category does not fit this type of vehicle.",
  forbidden: "Your account is not allowed to do this.",
  notfound: "That item was not found.",
  not_rejected: "Only rejected listings can be sent for approval again.",
  photo_EMPTY: "Choose at least one image file.",
  photo_TOO_BIG: "Each photo can be at most 5 MB.",
  photo_NOT_AN_IMAGE: "Only JPEG, PNG or WebP images are accepted.",
  photo_TOO_MANY: "A vehicle can have at most 8 photos. Remove one first.",
  photo_NOT_FOUND: "That vehicle was not found.",
  photo_FORBIDDEN: "Your account is not allowed to do this.",
  maintenance_invalid: "Choose the type and a valid date; the next deadline must also be a valid date.",
  maintenance_dates: "The next deadline must be after the date the work was done.",
};
