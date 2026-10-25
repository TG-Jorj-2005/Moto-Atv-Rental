import { z } from "zod";

// A string field that never contains a NUL character: PostgreSQL cannot store one and answers with an error, so a
// crafted request carrying it is refused at validation instead of becoming a server error.
export const text = () => z.string().regex(/^[^\u0000]*$/, "Invalid characters");
