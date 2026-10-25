import { assertRunningAgainstTestDatabase } from "./safe-test-db";

// Runs before every integration test file: if the process is not pointed at the validated test database,
// nothing else gets to run.
assertRunningAgainstTestDatabase(process.env);
