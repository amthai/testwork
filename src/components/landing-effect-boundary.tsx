import { Component, type ReactNode } from "react"

// Only the optional visual layer belongs inside this boundary.
export class LandingEffectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
