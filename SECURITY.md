# Security policy

## Reporting a problem

Please report security problems **privately**, never in a public issue.

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, how to reproduce it, and what it lets someone do.

You will get an answer as soon as it can be looked at. Please give some time to fix it before telling anyone else.

## What counts

- Reading or changing someone else's data
- Getting past the rules in `firestore.rules`
- Sending push notifications to other people's devices
- Getting around the Content-Security-Policy

## What doesn't

- Problems that need access to an unlocked device or to someone's browser profile. The app lock is a privacy screen, not encryption, and says so.
- Things that only affect your own copy of Till after you changed its code or settings.

## Your own copy

If you run your own copy, the values in `.env.local` are public by design (they end up in the built app). The only secret is the push key in `push-server/.dev.vars`: keep it out of version control and back it up.
