"""Explicit publication manifest: public content, stable identity and canonical payload hash."""
import hashlib
import json
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def validate_shape(value, schema):
    """Exercise this small static schema using only the site's standard-library runner."""
    expected = schema.get('type')
    types = {'object': dict, 'array': list, 'string': str, 'integer': int, 'boolean': bool}
    if expected and type(value) is not types[expected]:
        raise ValueError('type')
    if 'const' in schema and value != schema['const']:
        raise ValueError('const')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError('enum')
    if expected == 'object':
        props = schema['properties']
        if not set(schema.get('required', ())) <= value.keys():
            raise ValueError('required')
        if schema.get('additionalProperties') is False and not value.keys() <= props.keys():
            raise ValueError('closed fields')
        for key in value.keys() & props.keys():
            validate_shape(value[key], props[key])
        for condition in schema.get('allOf', ()):
            matches = all(value.get(k) == rule['const'] for k, rule in condition['if']['properties'].items())
            if matches:
                for key, rule in condition['then']['properties'].items():
                    validate_shape(value[key], rule)
    if expected == 'array':
        if len(value) > schema.get('maxItems', 100000):
            raise ValueError('array limit')
        for item in value:
            validate_shape(item, schema['items'])
    if expected == 'string':
        if len(value) < schema.get('minLength', 0) or len(value) > schema.get('maxLength', 100000):
            raise ValueError('string limit')
        if 'pattern' in schema and not re.fullmatch(schema['pattern'], value):
            raise ValueError('pattern')
    if expected == 'integer' and value < schema.get('minimum', value):
        raise ValueError('minimum')


class UpdateManifestTests(unittest.TestCase):
    def test_manifest_has_closed_schema_and_unique_stable_ids(self):
        manifest = json.loads((ROOT / 'data/update-events.json').read_text())
        schema = json.loads((ROOT / 'data/update-events.schema.json').read_text())
        validate_shape(manifest, schema)
        self.assertEqual(len({e['id'] for e in manifest['events']}), len(manifest['events']))
        for entry in manifest['events']:
            payload = {k: v for k, v in entry.items() if k != 'payload_sha256'}
            encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
            self.assertEqual(hashlib.sha256(encoded).hexdigest(), entry['payload_sha256'])
            if entry['tombstone']:
                continue
            if entry['route_key'] in ('kanread', 'pulse'):
                content = json.loads((ROOT / f"data/{entry['route_key']}.json").read_text())
                rows = [row for row in content['items'] if row['id'] == entry['route_ref']]
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]['status'], 'verified')
            else:
                self.assertEqual(entry['route_key'], 'reset_' + entry['route_ref'])
                self.assertIn(f'id="{entry["route_ref"]}-board"', (ROOT / 'codex.html').read_text())

    def test_schema_rejects_unannounced_kinds_external_links_and_private_payload(self):
        schema = json.loads((ROOT / 'data/update-events.schema.json').read_text())
        good = dict(id='stable-publication', revision=1, channel='kanread_updates', kind='kanread_published',
                    route_key='kanread', route_ref='kr-public', title='Public title', body='Public body',
                    occurred_at_ms=1, tombstone=False, payload_sha256='a' * 64)
        validate_shape(dict(schema_version=1, revision=1, events=[good]), schema)
        for changes in ({'kind': 'private_calendar'}, {'route_ref': '//evil.test'}, {'url': 'https://evil.test'},
                        {'channel': 'bound_machine_public_activity'}, {'endpoint': 'secret'}, {'tombstone': 'false'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_shape(dict(schema_version=1, revision=2, events=[{**good, **changes}]), schema)


if __name__ == '__main__':
    unittest.main()
