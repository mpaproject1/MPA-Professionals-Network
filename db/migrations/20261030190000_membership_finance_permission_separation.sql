insert into app_permission(permission_code,area,label,description,sensitive,system_only)
values
  ('membership.review','Membership','Review membership applications','Review submitted membership applications and record the review decision. Does not grant payment verification or reversal.',true,false),
  ('membership.activate','Membership','Activate approved memberships','Activate a membership application after the independent payment and approval requirements are satisfied.',true,false),
  ('finance.payment.verify','Finance','Verify membership payments','Verify payment evidence and transaction status. Does not grant membership application review or activation.',true,false),
  ('finance.payment.reverse','Finance','Reverse membership payments','Reverse an eligible membership payment with the required reason and audit record. Does not grant membership application review or activation.',true,false)
on conflict(permission_code) do update
set area=excluded.area,
    label=excluded.label,
    description=excluded.description,
    sensitive=excluded.sensitive,
    system_only=excluded.system_only;
