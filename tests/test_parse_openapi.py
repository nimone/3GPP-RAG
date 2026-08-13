from pathlib import Path
import yaml
from threegpp_rag.ingest.parse_openapi import parse_openapi, spec_from_filename

SPEC = {
    "openapi": "3.0.1",
    "info": {"title": "TS 28.111 Fault NRM", "version": "19.5.0"},
    "components": {"schemas": {
        "AlarmRecord": {
            "type": "object",
            "description": "Represents an alarm.",
            "properties": {
                "alarmId": {"type": "string", "description": "Unique identifier"},
                "perceivedSeverity": {"type": "string", "enum": ["CRITICAL", "MAJOR"]},
            },
            "required": ["alarmId"],
        },
    }},
    "paths": {"/alarms": {"get": {"summary": "List alarms", "operationId": "getAlarmList"}}},
}

def test_spec_from_filename():
    assert spec_from_filename(Path("TS28111_FaultNrm.yaml")) == ("TS 28.111", "FaultNrm")

def test_schema_becomes_a_section(tmp_path):
    p = tmp_path / "TS28111_FaultNrm.yaml"
    p.write_text(yaml.safe_dump(SPEC))
    secs = parse_openapi(p)
    schema = next(s for s in secs if "AlarmRecord" in s.clause)
    assert schema.spec == "TS 28.111"
    assert schema.clause == "OpenAPI/FaultNrm#AlarmRecord"
    assert "alarmId" in schema.body
    assert "Unique identifier" in schema.body
    assert "CRITICAL" in schema.body
    assert "required" in schema.body.lower()

def test_path_operation_becomes_a_section(tmp_path):
    p = tmp_path / "TS28111_FaultNrm.yaml"
    p.write_text(yaml.safe_dump(SPEC))
    secs = parse_openapi(p)
    op = next(s for s in secs if "/alarms" in s.body)
    assert "GET" in op.body and "getAlarmList" in op.body

def test_empty_spec_yields_nothing(tmp_path):
    p = tmp_path / "TS28532_Empty.yaml"
    p.write_text(yaml.safe_dump({"openapi": "3.0.1"}))
    assert parse_openapi(p) == []
