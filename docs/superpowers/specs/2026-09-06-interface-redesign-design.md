# Proof interface redesign

Date: 2026-09-06

## Objective

Replace the current dense studio interface with a calm, focused product for practising a real test-task defense. The experience must feel like joining a familiar video call, not operating an AI dashboard.

## Product flow

The MVP has four sequential states in one React application:

1. Landing page.
2. Call preparation.
3. Live defense call.
4. Feedback after the call.

There is no transcript panel, observation feed, upload flow, whiteboard, or visible screenshot gallery.

## Landing page

The landing is a single-column, light, spacious page inspired by Glide's simplicity rather than copied from it.

- Small header with the Proof wordmark and one secondary text action.
- One large outcome-led headline: practise defending a design test task before the real interview.
- One short supporting paragraph.
- One primary CTA: `Начать защиту`.
- A restrained product preview that demonstrates a call, not a dashboard.
- Three short trust points: real voice, screen context, feedback after the call.

The CTA transitions to preparation without asking for account or task details in the MVP.

## Preparation screen

Preparation is a centered shadcn `Card`. It contains only what is necessary before joining:

- microphone permission and current status;
- screen-share selection and current status;
- three preparation tips: open the Figma file, close private windows, silence notifications;
- back action;
- primary `Начать созвон` action.

The user may retry a failed permission. The call button becomes available when both microphone and screen are ready. The selected screen is previewed discreetly inside the card so the user can verify the correct source.

## Call screen

The call occupies the full viewport and resembles a conventional video-call product.

- Minimal top bar: Proof, protected-session indicator, elapsed time.
- One central participant stage with the AI interviewer avatar, name, and speaking/listening status.
- A small screen-share picture-in-picture preview confirms what is being shared.
- Floating bottom control dock: microphone toggle, screen status/control, and red end-call button.
- No sidebars, transcript, screenshots, analysis, progress steps, or developer badges.

Screen frames continue to be sampled in memory in the background for future AI analysis, but they are not presented as a user-facing feature during the call.

## Feedback screen

After ending the call, show a quiet summary page with:

- overall result;
- one strength;
- one improvement;
- actions to repeat the defense or return home.

Until the OpenAI key is connected, feedback is clearly marked as a prototype result.

## Visual system

- Style: exaggerated minimalism with generous negative space.
- Background: warm neutral `#FAFAFA`, avoiding pure white across large surfaces.
- Foreground: `#09090B`.
- Primary controls: near-black `#18181B`.
- Accent and focus: cobalt `#2563EB`.
- Destructive call action: `#DC2626`.
- Borders: `#E4E4E7`.
- Display typography: Archivo.
- Interface typography: Space Grotesk.
- Components: shadcn/ui primitives styled through semantic Tailwind tokens.
- Icons: Lucide only; no emoji or decorative icon overload.

## Interaction design

- Route/state changes use a 240–300 ms opacity and vertical-position transition.
- Button hover and press feedback stays within 120–180 ms.
- Permission rows animate only when their state changes.
- The AI participant has one restrained speaking/listening indicator.
- Motion uses only `transform` and `opacity` where possible.
- `prefers-reduced-motion` disables non-essential movement.
- Controls have visible keyboard focus and a minimum 44 px hit target.

## Media and state behavior

- `getUserMedia({ audio: true })` is requested from the preparation screen.
- `getDisplayMedia({ video: true })` is requested from the preparation screen.
- Both streams remain active when entering the call.
- The microphone control changes the real audio-track `enabled` state.
- Screen sharing ending from the browser changes the call status immediately.
- The existing five-second in-memory screenshot capture remains active during the call.
- All media tracks and timers are stopped when leaving or ending the call.

## Error handling

- Unsupported browser APIs produce a local inline alert with a concrete explanation.
- Denied microphone or screen permission leaves that preparation row retryable.
- Ending screen sharing during the call does not crash or end the voice session.
- The application never claims that OpenAI Realtime is connected while the mock transport is active.

## Implementation boundaries

- Keep Vite, React, and TypeScript.
- Add Tailwind CSS using the official Vite plugin.
- Add shadcn configuration and only the primitives used by this flow.
- Use Framer Motion for page continuity and small state transitions.
- Keep the realtime provider behind the existing transport interface.
- No authentication, payments, backend persistence, or production AI calls in this redesign.

## Verification

- TypeScript production build.
- Keyboard navigation and focus-state inspection.
- Responsive checks at 375, 768, 1024, and 1440 px widths.
- Landing-to-preparation state transition without media permissions.
- Permission-denial and permission-retry paths.
- Track cleanup after ending the call.
- Reduced-motion behavior.
