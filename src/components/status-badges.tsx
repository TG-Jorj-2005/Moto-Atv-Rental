import type { BookingStatus, ListingStatus, QuoteStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { DisplayStatus } from "@/lib/vehicle-rules";

const BOOKING: Record<BookingStatus, { tone: "warning" | "info" | "brand" | "success" | "neutral"; label: string }> = {
  PENDING: { tone: "warning", label: "Awaiting confirmation" },
  CONFIRMED: { tone: "info", label: "Confirmed" },
  ACTIVE: { tone: "brand", label: "In progress" },
  COMPLETED: { tone: "success", label: "Completed" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
};
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { tone, label } = BOOKING[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const VEHICLE: Record<DisplayStatus, { tone: "success" | "brand" | "warning" | "neutral"; label: string }> = {
  AVAILABLE: { tone: "success", label: "Available" },
  RENTED: { tone: "brand", label: "Rented now" },
  IN_SERVICE: { tone: "warning", label: "In service" },
  RETIRED: { tone: "neutral", label: "Retired" },
};
export function VehicleStatusBadge({ status }: { status: DisplayStatus }) {
  const { tone, label } = VEHICLE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const LISTING: Record<ListingStatus, { tone: "warning" | "success" | "danger"; label: string }> = {
  PENDING: { tone: "warning", label: "Awaiting approval" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "Rejected" },
};
export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const { tone, label } = LISTING[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const QUOTE: Record<QuoteStatus, { tone: "info" | "brand" | "success" | "neutral"; label: string }> = {
  NEW: { tone: "info", label: "New" },
  QUOTED: { tone: "brand", label: "Offer ready" },
  ACCEPTED: { tone: "success", label: "Accepted" },
  DECLINED: { tone: "neutral", label: "Closed" },
};
export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { tone, label } = QUOTE[status];
  return <Badge tone={tone}>{label}</Badge>;
}
