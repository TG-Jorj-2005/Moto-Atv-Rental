import { redirect } from "next/navigation";

export default function OldBookings() {
  redirect("/account/bookings");
}
