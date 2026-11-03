-- Test Lab stores only the normal one-way password hash in app_user.
-- Export regenerates passwords and revokes existing sessions; no recoverable copy remains.
alter table test_portfolio_account drop column if exists password_ciphertext;
