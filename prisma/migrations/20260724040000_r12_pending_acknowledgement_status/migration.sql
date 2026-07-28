-- Requests whose items are all implemented but still waiting on the employee's
-- acknowledgement were labelled "Implementation Pending", which told IT there
-- was work left to do when there was not.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_ACKNOWLEDGEMENT' AFTER 'IMPLEMENTATION_PENDING';
