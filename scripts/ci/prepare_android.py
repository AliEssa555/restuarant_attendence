"""Prepare an Android CI build without committing Firebase config or signing keys."""
import base64
import json
import os
from pathlib import Path

PACKAGE_NAME = 'com.demo.attendance.restaurant_attendance'


def prepare():
    required = [
        'GOOGLE_SERVICES_JSON', 'FIREBASE_APP_ID', 'FIREBASE_TESTER_GROUPS',
        'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PATH', 'ANDROID_KEY_ALIAS',
        'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_PASSWORD',
    ]
    missing = [name for name in required if not os.environ.get(name, '').strip()]
    if missing:
        raise SystemExit('Configure GitHub Actions secrets/variables: ' + ', '.join(missing))

    config = json.loads(os.environ['GOOGLE_SERVICES_JSON'])
    project = config['project_info']
    clients = [client for client in config.get('client', []) if
               client['client_info'].get('android_client_info', {}).get('package_name') == PACKAGE_NAME]
    if len(clients) != 1:
        raise SystemExit('google-services.json must contain exactly one matching Android package: ' + PACKAGE_NAME)
    client = clients[0]
    app_id = client['client_info']['mobilesdk_app_id']
    if app_id != os.environ['FIREBASE_APP_ID']:
        raise SystemExit('FIREBASE_APP_ID does not match the Android app in google-services.json.')
    if project['project_id'] == 'restaurant-attendance-demo' or app_id.startswith('1:000000000000:'):
        raise SystemExit('Use real Firebase configuration, not the emulator placeholder.')

    # JSON string quoting also works for these Dart literals; escape interpolation.
    def literal(value):
        return json.dumps(str(value), ensure_ascii=True).replace('$', r'\$')

    fields = {
        'apiKey': client['api_key'][0]['current_key'],
        'appId': app_id,
        'messagingSenderId': project['project_number'],
        'projectId': project['project_id'],
    }
    if project.get('storage_bucket'):
        fields['storageBucket'] = project['storage_bucket']
    options = ',\n'.join('    ' + key + ': ' + literal(value) for key, value in fields.items())
    dart = """// Generated only for the Android CI build.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return android;
    throw UnsupportedError('This CI build configures Android only.');
  }
  static const FirebaseOptions android = FirebaseOptions(
""" + options + "\n  );\n}\n"

    mobile = Path('apps/mobile')
    (mobile / 'android/app/google-services.json').write_text(json.dumps(config))
    (mobile / 'lib/firebase_options.dart').write_text(dart)
    path = Path(os.environ['ANDROID_KEYSTORE_PATH'])
    path.write_bytes(base64.b64decode(''.join(os.environ['ANDROID_KEYSTORE_BASE64'].split()), validate=True))
    path.chmod(0o600)
    print('Prepared Android Firebase config and release signing key.')


if __name__ == '__main__':
    prepare()
