-- Read-only SQL Server login for Bunyan. Run as a sysadmin / securityadmin.
-- Grants SELECT on CORE.Log only; nothing else in CATSDEV is readable.

USE [master];
GO
CREATE LOGIN [bunyan_reader]
    WITH PASSWORD = N'$(BUNYAN_READER_PASSWORD)',
         DEFAULT_DATABASE = [CATSDEV],
         CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF;
GO

USE [CATSDEV];
GO
CREATE USER [bunyan_reader] FOR LOGIN [bunyan_reader];
GO
GRANT SELECT ON OBJECT::[CORE].[Log] TO [bunyan_reader];
-- Defense in depth: explicitly block writes even if a role grants them later.
DENY INSERT, UPDATE, DELETE, ALTER ON OBJECT::[CORE].[Log] TO [bunyan_reader];
GO

-- Recommended: index that makes the daily range query cheap (run by a DBA if not present).
-- CREATE INDEX IX_Log_AddTimeStamp ON [CORE].[Log] (AddTimeStamp) INCLUDE (LogIdentifier);

-- Verify:
-- EXECUTE AS LOGIN = 'bunyan_reader';
-- SELECT TOP (1) * FROM CORE.Log;      -- works
-- SELECT TOP (1) * FROM sys.tables;    -- returns nothing useful
-- REVERT;
