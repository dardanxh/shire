import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Globals are off, so Testing Library's auto-cleanup doesn't run — do it here.
afterEach(cleanup);
