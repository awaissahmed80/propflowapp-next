-- Export one agent's leads and their history from the old CRM (eadb) for PropFlow's
-- Import (Settings › Import & export). Set @agent to the old users.id, run both queries and
-- save each result as CSV:
--   1. leads.csv       → import as "Leads" first
--   2. activities.csv  → then import as "Lead activities" (they find their lead by Old ID)
-- Column names match PropFlow's import fields, so the files map themselves.
-- Times in the old database are UTC; PropFlow's import reads Pakistan time, hence +5 hours.

SET @agent = 24;

-- 1. Leads
SELECT
  l.id                                                         AS `Old ID`,
  TRIM(CONCAT_WS(' ', c.first_name, c.last_name))              AS `Name`,
  COALESCE(NULLIF(TRIM(c.phone), ''), NULLIF(TRIM(c.phone_alt), '')) AS `Mobile`,
  NULLIF(TRIM(c.email), '')                                    AS `Email`,
  NULLIF(TRIM(c.city), '')                                     AS `City`,
  CASE UPPER(TRIM(c.source))
    WHEN 'FACEBOOK' THEN 'Facebook ads'
    WHEN 'WHATSAPP' THEN 'WhatsApp'
    WHEN 'DIRECT'   THEN 'Walk-in'
  END                                                          AS `Source`,
  CASE l.status
    WHEN 'NEW'         THEN 'New'
    WHEN 'PIPELINE'    THEN IF(EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id AND t.deleted_at IS NULL), 'Contacted', 'New')
    WHEN 'TOKEN'       THEN 'Booked'
    WHEN 'CLOSED WON'  THEN 'Booked'
    WHEN 'CLOSED LOST' THEN 'Lost'
  END                                                          AS `Status`,
  CASE l.class
    WHEN 'VERY HOT'  THEN 'Very hot'
    WHEN 'HOT'       THEN 'Hot'
    WHEN 'MODERATE'  THEN 'Moderate'
    WHEN 'COLD'      THEN 'Cold'
    WHEN 'VERY COLD' THEN 'Very cold'
  END                                                          AS `Temperature`,
  p.name                                                       AS `Project`,
  TRIM(CONCAT_WS(' ', u.first_name, u.last_name))              AS `Agent`,
  NULLIF(CONCAT_WS('\n',
    NULLIF(TRIM(REPLACE(l.description, '\r', '')), ''),
    IF(TRIM(COALESCE(l.`group`, '')) <> '', CONCAT('Group: ', TRIM(l.`group`)), NULL)
  ), '')                                                       AS `Notes`,
  DATE_FORMAT(l.created_at + INTERVAL 5 HOUR, '%Y-%m-%d %H:%i') AS `Lead date`,
  -- Only follow-ups still ahead (older due dates would all land as missed)
  IF(l.due_date > UTC_TIMESTAMP() AND l.status IN ('NEW', 'PIPELINE'),
     DATE_FORMAT(l.due_date + INTERVAL 5 HOUR, '%Y-%m-%d %H:%i'), NULL) AS `Next follow-up`,
  IF(l.due_date > UTC_TIMESTAMP() AND l.status IN ('NEW', 'PIPELINE'),
     IF(l.`next` = 'Arrange Meeting', 'Office meeting', 'Call'), NULL) AS `Follow-up type`,
  IF(l.due_date > UTC_TIMESTAMP() AND l.status IN ('NEW', 'PIPELINE') AND l.`next` NOT IN ('Do Nothing', 'Follow Up'),
     l.`next`, NULL)                                           AS `Follow-up note`
FROM leads l
JOIN clients c       ON c.id = l.client_id
LEFT JOIN projects p ON p.id = l.project_id
LEFT JOIN users u    ON u.id = l.assigned_to
WHERE l.assigned_to = @agent
  AND l.deleted_at IS NULL
ORDER BY l.created_at;

-- 2. Lead activities (the old "tasks": logged calls, messages and meetings)
SELECT
  t.lead_id                                                    AS `Lead`,
  CASE t.action
    WHEN 'Call'             THEN 'Call'
    WHEN 'Call Attempt'     THEN 'Call'
    WHEN 'WhatsApp Message' THEN 'WhatsApp'
    WHEN 'WhatsApp Call'    THEN 'WhatsApp'
    WHEN 'Meeting'          THEN 'Office meeting'
    WHEN 'SMS'              THEN 'SMS'
    ELSE 'Call'                                   -- "Closed Lost" was logged as a task
  END                                                          AS `Type`,
  DATE_FORMAT(t.created_at + INTERVAL 5 HOUR, '%Y-%m-%d %H:%i') AS `Date & time`,
  'Done'                                                       AS `Done or planned`,
  CASE t.action
    WHEN 'Call Attempt' THEN 'No answer'
    WHEN 'Closed Lost'  THEN 'Not interested'
  END                                                          AS `Outcome`,
  NULLIF(CONCAT_WS(' ',
    IF(t.action = 'Closed Lost', 'Closed lost:', NULL),
    IF(t.action = 'WhatsApp Call', 'WhatsApp call:', NULL),
    NULLIF(TRIM(REPLACE(t.comments, '\r', '')), '')
  ), '')                                                       AS `Notes`,
  TRIM(CONCAT_WS(' ', u.first_name, u.last_name))              AS `By`
FROM tasks t
JOIN leads l      ON l.id = t.lead_id
LEFT JOIN users u ON u.id = t.user_id
WHERE l.assigned_to = @agent
  AND l.deleted_at IS NULL
  AND t.deleted_at IS NULL
ORDER BY t.lead_id, t.created_at;
