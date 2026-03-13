# Manus Platform Dependency Audit

## Files That Need Changes

### CRITICAL — Must Remove/Replace

1. **server/_core/oauth.ts** — Full Manus OAuth callback route. DELETE entirely.
2. **server/_core/sdk.ts** — OAuthService class, exchangeCodeForToken, getUserInfo, getUserInfoWithJwt. The `authenticateRequest` method has an OAuth fallback (lines 273-289) that tries to sync from OAuth server when user not in DB. KEEP the JWT session parts (signSession, verifySession, createSessionToken, authenticateRequest minus OAuth fallback). REMOVE the OAuthService class and all OAuth methods.
3. **server/_core/index.ts** — Line 6: imports registerOAuthRoutes. Line 214: calls registerOAuthRoutes(app). REMOVE both.
4. **server/_core/env.ts** — Contains `oAuthServerUrl`, `forgeApiUrl`, `forgeApiKey`, `appId`, `ownerOpenId`. REMOVE OAuth-specific ones. Keep `forgeApiUrl`/`forgeApiKey` ONLY if built-in LLM fallback is needed (it is — llmService.ts uses it).
5. **client/src/components/ManusDialog.tsx** — Manus-branded login dialog. DELETE entirely (not imported anywhere).
6. **server/_core/types/manusTypes.ts** — Manus OAuth type definitions. DELETE.

### MODERATE — Clean Up References

7. **server/_core/envValidation.ts** — Has OAuth env var validation. Remove OAuth entries, keep the rest.
8. **server/localAuth/localAuthService.ts** — Error message "This account uses OAuth login" (line 140). Change to generic message.
9. **server/localAuth/localAuthRouter.ts** — Error messages reference OAuth (lines 49, 88). Change to generic.
10. **server/admin/adminUsersRouter.ts** — Error message references OAuth (line 133). Change to generic.
11. **server/hybridrag/hybridragRouter.ts** — Comments reference "Manus built-in LLM". Change to "built-in LLM fallback".
12. **server/auth.logout.test.ts** — loginMethod: "manus" in test fixtures. Change to "local".
13. **server/baselines/baselinesRouter.test.ts** — Same.
14. **server/indexer/indexerRouter.test.ts** — Same.
15. **server/notes/notesRouter.test.ts** — Same.
16. **server/savedSearches/savedSearchesRouter.test.ts** — Same.
17. **server/wazuh/wazuhRouter.test.ts** — Same.

### KEEP AS-IS (Platform Infrastructure)

18. **server/_core/llm.ts** — Built-in LLM uses Forge API. This is the FALLBACK when custom LLM is down. KEEP but rename references from "Forge" to "Built-in LLM API".
19. **server/_core/notification.ts** — Manus notification service. Will not work on-prem. Make it gracefully no-op.
20. **server/_core/systemRouter.ts** — notifyOwner route. Keep but make it return false gracefully.
21. **server/storage.ts** — S3 storage via Forge. Keep — needed for file storage.
22. **server/_core/dataApi.ts** — Data API via Forge. Keep — may be used.
23. **server/_core/imageGeneration.ts** — Image gen via Forge. Keep — may be used.
24. **server/_core/voiceTranscription.ts** — Voice transcription via Forge. Keep — may be used.
25. **server/_core/map.ts** — Google Maps via Forge. Keep — may be used.
26. **client/public/__manus__/debug-collector.js** — Debug/telemetry collector. KEEP (framework file, harmless).
27. **client/src/components/Map.tsx** — Uses VITE_FRONTEND_FORGE for maps proxy. KEEP.
28. **server/localAuth/localAuth.test.ts** — Tests OAUTH_SERVER_URL detection. Update test.
