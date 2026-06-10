import { ErrorBoundary } from "../src/components/ErrorBoundary";
import * as errorReporter from "../src/services/errorReporter";

afterEach(() => {
  jest.restoreAllMocks();
});

test("componentDidCatch marks the boundary as errored and reports the error", () => {
  const reportSpy = jest.spyOn(errorReporter, "reportError").mockImplementation(() => undefined);
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: false };
  (boundary as any).setState = (state: { hasError: boolean }) => {
    boundary.state = { ...boundary.state, ...state };
  };

  boundary.componentDidCatch(new Error("boom"), { componentStack: "    in Bomb\n" });

  expect(boundary.state.hasError).toBe(true);
  expect(reportSpy).toHaveBeenCalledTimes(1);
});

test("handleReload resets the error boundary state", () => {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: true };
  (boundary as any).setState = (state: { hasError: boolean }) => {
    boundary.state = { ...boundary.state, ...state };
  };

  boundary.handleReload();
  expect(boundary.state.hasError).toBe(false);
});
