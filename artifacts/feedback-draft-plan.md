# Plan: Send feedback opens a Google Form

## Goal
"Send feedback" (panel Preferences and the settings page) opens a Google Form in a new tab, with the extension details already filled in. Today it opens a `mailto:` link (`openFeedback()` in `src/prefs.js`).

Decided 2026-10-24 (Max): a Google Form instead of a Karbon email draft. A form works for everyone, writes nothing into the person's Karbon, needs no new endpoints, and collects responses in a Sheet.

## Form fields
In this order:
1. **What kind of feedback is this?** Multiple choice, optional: Something's broken, An idea, A question, Other. It makes the Sheet easy to sort.
2. **What happened, or what would you like to see?** Long answer, required.
3. **Your email, if you'd like a reply.** Short answer, optional, with email validation.
4. **Keep me posted.** Checkboxes, optional, both unchecked:
   - Email me if a Karbon update breaks the extension.
   - Send me the Navica newsletter.
   Help text: "We only use your email for what you check here."
5. **Extension details.** Long answer, optional, prefilled. Help text: "Filled in for you: version and settings only, never client or work details. You can edit or clear it."

Form settings:
- Don't collect email addresses, and don't require sign-in, so anyone can answer without a Google account.
- Don't limit to one response.
- Confirmation message: "Thanks. If you left your email, we'll reply there."

## Step 1: Max builds the form
Create it from the fields above. Then use "Get pre-filled link," type a placeholder into the Extension details field, and send Claude the link. It carries the `entry.<id>` for that field.

## Step 2: Feedback button (`src/prefs.js`)
- Replace `FEEDBACK_EMAIL` with `FEEDBACK_FORM` (the form's `viewform` URL) and `FEEDBACK_DETAILS_ENTRY` (the entry ID).
- `openFeedback()` opens `${FEEDBACK_FORM}?usp=pp_url&${entry}=${encodeURIComponent(supportDetails(...))}` in a new tab. `supportDetails()` is unchanged, so still no client or work details, and nothing personal goes in the URL.
- Keep the email address as a small "Or email us" link on the settings page, for people who prefer email.

## Step 3: Copy
- `welcome.html` Support lede: "Send feedback opens a short form with your version and settings filled in. It never includes client or work details."
- `docs/privacy-policy.md` Feedback section: the form is a Google Form; the extension fills in only the version and settings; you can edit them; your email is optional and only used for what you check.

## Step 4: Privacy review (`docs/PRIVACY.md`)
Google Forms is a new destination, reached through a link that carries data, so it needs the review.
- Data inventory: update the feedback row (destination Google Forms, sent only if the person submits; email optional).
- Policy text: as in Step 3, and name the opt-ins.
- Store Privacy tab: check whether an optional email collected on the form, not by the extension, changes any answer. It likely doesn't, since the extension itself never handles it.

## Step 5: Test and hand over
- Browser pane: the button opens the form with details filled in, from both the panel and the settings page.
- Submit one test response and check it lands in the Sheet.
- Bump `version` in `src/manifest.json`, run `./build.sh`, and update `claude/handoff.md` and `claude/context/growth.md` (the opt-ins now live on the form).

## Note
The working tree has uncommitted changes (the shared `src/karbon.js`, and version 0.7.18 in the manifest). Commit those first so this change stays separate.
