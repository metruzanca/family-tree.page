# Storage plans

Internal planning note. Do not link this from the landing page or the app until a plan is actually for sale.

## Current limits

Every account starts on the free limits:

| Limit | Default | Column |
|---|---|---|
| Media storage | 1 GiB | `users.storage_quota_bytes` |
| People created | 500 | `users.people_quota` |

Storage counts originals plus thumbnails across every tree, by uploader. People are a lifetime count of rows the account created, so deleting a person does not return a slot. Both limits can be raised for one account with SQL, without a deploy:

```sql
UPDATE users
SET storage_quota_bytes = 10 * 1024 * 1024 * 1024,
    people_quota = 2000
WHERE email = 'someone@example.com';
```

## Proposed tiers

Prices are placeholders until real Railway storage, egress, and backup costs are measured. The shape matters more than the exact number.

| Tier | Storage | People | Suggested price | Target user |
|---|---|---|---|---|
| Free | 1 GiB | 500 | €0 | One family, a few hundred people, phone photos |
| Family | 10 GiB | 2,000 | €3 / month or €30 / year | Several branches, scanned albums |
| Archive | 50 GiB | 10,000 | €8 / month or €80 / year | Large documented trees, high-resolution scans |
| Genealogist | 200 GiB | 50,000 | €20 / month or €200 / year | Service providers building trees for many families |

The free tier should stay genuinely usable. A 1 GiB cap is enough for roughly 500 to 2,000 compressed phone photos, and 500 people covers a deep tree for one family. The people cap protects the database, not storage, so it should scale with the storage tier rather than being sold separately.

## Cost model

Storage is charged twice in practice: once for the live object and once for the backup copy. Keep that in mind when setting a price.

```text
monthly cost per account
  = storage_gb * (live storage rate + backup storage rate)
  + egress for downloads
  + database share
  + payment fees
```

Before publishing prices:

1. Measure the real average bytes per paying account and the egress per month.
2. Add the backup copy, which roughly doubles the raw storage cost.
3. Add payment processing fees (roughly 2 to 4 percent plus a fixed fee).
4. Leave room for abuse and for accounts that sit near their cap.
5. Compare the result with the tiers above and adjust once, before launch.

## Enforcing a plan

There is no billing integration yet. When one lands, map the plan to the two columns and keep the enforcement code unchanged:

- `storage_quota_bytes` is checked inside the upload transaction.
- `people_quota` is checked inside the person create transaction.
- Lowering a quota must never delete content. Let the account go over the limit and block new uploads or people until they delete something or upgrade.

## Abuse thresholds

The abuse report scales some thresholds from the account quota, so paid accounts are not flagged for using what they paid for:

- More than 2x the storage quota uploaded in 24 hours.
- 1,000 files in 24 hours.
- 20 tree create and delete cycles in 24 hours.
- 20 quota rejections in 24 hours.
- 20 rejected file types in 24 hours.
- 20 rate limit trips in 24 hours.

Review these before selling a large tier. A 200 GiB account uploading 400 GiB in a day would cost real money even if it never touches another limit.
