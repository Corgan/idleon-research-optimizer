# Idleon Builds

Standalone browser calculators and optimizers for Legends of Idleon. Open `index.html` through a local static server to access the calculator index.

The All Stats Dashboard provides map-aware character/account breakdowns, normal-map combat outcomes, Divinity rates, Printer Sample Size, and category-specific Carry Capacity. Specialized allocation and simulation workflows remain in their dedicated calculators.

`shadow.html` uses the shared Google sign-in/save loader and shows only a large YES, NO, or UNKNOWN from the saved multiplayer restriction flag (`OptLacc[26]`: zero is unrestricted, nonzero is restricted). Before loading or with missing or invalid flags, it shows UNKNOWN rather than NO; this checks the saved flag, not independent server-side moderation. Regression check: `node js\tests\test-shadowban-check.mjs`.
