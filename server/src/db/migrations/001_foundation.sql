CREATE SCHEMA IF NOT EXISTS {{APP_SCHEMA}};
CREATE SCHEMA IF NOT EXISTS {{ARTIFACT_SCHEMA}};

COMMENT ON SCHEMA {{APP_SCHEMA}} IS 'ReqAI business state; managed by additive migrations';
COMMENT ON SCHEMA {{ARTIFACT_SCHEMA}} IS 'ReqAI large artifact content isolated from normal job queries';
