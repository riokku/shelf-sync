-- Second half of the cross-org leak fix add_platform_cross_org_read_rpcs
-- started — see that migration's own comment for the full story (why
-- add_platform_admin's own three "Platform admins can view all X" policies
-- were a real, if partially-mitigated, cross-org leak the moment a
-- platform admin was also a member of a real org). Deliberately pushed as
-- its own, later migration rather than folded into that one — only once
-- every Studio page had actually switched to calling
-- platform_list_profiles()/platform_list_feedback()/platform_list_client_errors()
-- instead of reading these tables directly, so there was never a window
-- where an already-deployed frontend build relied on a policy this
-- migration removes out from under it.
--
-- feedback's own "Platform admins can update feedback status" UPDATE policy
-- is untouched — that write was never part of the additive-permissive-
-- SELECT-policy problem these three were (no other permissive UPDATE
-- policy exists on that table for it to collide with). platform_action_log
-- was never affected either, having had no org-scoped sibling SELECT
-- policy to leak through in the first place.
drop policy "Platform admins can view all profiles" on public.profiles;
drop policy "Platform admins can view all feedback" on public.feedback;
drop policy "Platform admins can view all client errors" on public.client_error_log;
