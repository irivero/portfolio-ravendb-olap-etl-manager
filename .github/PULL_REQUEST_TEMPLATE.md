## Description
<!-- Brief description of what this PR does -->

## JIRA Ticket
<!-- Link to JIRA ticket -->
[OPPRA-XXX](https://oppra.atlassian.net/browse/OPPRA-XXX)

## Type of Change
<!-- Check all that apply -->
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Code style/formatting update
- [ ] ♻️ Refactoring (no functional changes)
- [ ] ⚡ Performance improvement

## Changes Made
<!-- List the specific changes made in this PR -->
- 
- 
- 

## Testing Done
<!-- Describe the testing you performed -->
- [ ] Manual testing completed
- [ ] Tested on multiple browsers (Chrome, Edge, Firefox)
- [ ] Tested connection with PEM certificate
- [ ] Tested connection with PFX certificate
- [ ] Tested error scenarios
- [ ] Tested on different RavenDB versions

## Screenshots (if applicable)
<!-- Add screenshots showing UI changes, before/after comparisons -->

## Impact Assessment
<!-- Describe potential impact on existing functionality -->
- **Breaking Changes**: Yes/No - If yes, describe
- **Database Schema Changes**: Yes/No - If yes, describe migration
- **API Changes**: Yes/No - If yes, describe
- **Dependencies Updated**: Yes/No - If yes, list

## Checklist
<!-- Check all that apply before submitting -->
- [ ] Code follows project style guidelines ([CONTRIBUTING.md](CONTRIBUTING.md))
- [ ] Self-reviewed my own code
- [ ] Commented complex/unclear code sections
- [ ] Removed unnecessary console.log statements
- [ ] Updated README.md (if feature added)
- [ ] Updated CHANGELOG.md (if user-facing change)
- [ ] Updated API documentation (if endpoints changed)
- [ ] No console errors in browser
- [ ] No linting errors
- [ ] Tested certificate authentication
- [ ] Verified ETL operations still work
- [ ] Checked for memory leaks in connection pool

## Additional Notes
<!-- Any additional context, concerns, or questions for reviewers -->

## Review Checklist for Reviewers
- [ ] Code quality and readability
- [ ] Error handling is comprehensive
- [ ] Security considerations addressed
- [ ] Performance implications considered
- [ ] Documentation is clear and accurate
- [ ] Testing coverage seems adequate

---

**⚠️ Important Reminders**:
- Ensure no sensitive data (certificates, API keys) are committed
- Verify `.gitignore` rules are followed
- Check that connection pooling is maintained properly
- Confirm backward compatibility unless breaking change is intentional
