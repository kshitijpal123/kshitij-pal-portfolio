import { act } from "@testing-library/react";
import { vi } from "vitest";

const instances = new Set<MockIntersectionObserver>();

/**
 * jsdom has no IntersectionObserver. This stand-in records observed elements
 * and only reports an intersection when a test calls `enterViewport`.
 */
class MockIntersectionObserver {
  readonly elements = new Set<Element>();

  constructor(readonly callback: IntersectionObserverCallback) {
    instances.add(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
    instances.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

export function installIntersectionObserver() {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

/** Reports every observed element as intersecting the viewport. */
export function enterViewport() {
  act(() => {
    for (const observer of instances) {
      const entries = [...observer.elements].map(
        (target) =>
          ({ target, isIntersecting: true }) as IntersectionObserverEntry,
      );
      observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  });
}
