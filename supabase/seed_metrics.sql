-- Headline totals
insert into public.metrics(code, name, unit, grouping, sort_order) values
  ('dist_total','Total Distribution','count','headline',1)
  on conflict (code) do nothing;

-- State splits
insert into public.metrics(code, name, unit, grouping, sort_order) values
  ('dist_nsw','NSW','count','by_state',10),
  ('dist_qld','QLD','count','by_state',20),
  ('dist_sant','SA/NT','count','by_state',30),
  ('dist_victas','VIC/TAS','count','by_state',40),
  ('dist_wa','WA','count','by_state',50)
  on conflict (code) do nothing;

-- Optional extras
insert into public.metrics(code, name, unit, grouping, sort_order) values
  ('audience','Audience Reach','households','headline',60),
  ('paper_tonnes','Paper (Tonnes)','tonnes','headline',70)
  on conflict (code) do nothing;
