import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// Runs before Firebase initialization so every emulator uses the chosen laptop.
class LocalDemoSetup extends StatefulWidget {
  const LocalDemoSetup({required this.onConnect, super.key});
  final Future<void> Function(String host) onConnect;
  @override
  State<LocalDemoSetup> createState() => _LocalDemoSetupState();
}

class _LocalDemoSetupState extends State<LocalDemoSetup> {
  final _host = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<File> _settings() async => File('${(await getApplicationSupportDirectory()).path}/local-demo-host.txt');
  Future<void> _load() async {
    try {
      final file = await _settings();
      if (await file.exists()) { final value = await file.readAsString(); if (mounted) _host.text = value; }
    } catch (_) { /* An unsaved address can always be entered again. */ }
  }
  Future<void> _connect() async {
    final host = _host.text.trim();
    final address = InternetAddress.tryParse(host);
    if (address == null || address.type != InternetAddressType.IPv4 || host == '0.0.0.0') {
      setState(() => _error = 'Enter the laptop IPv4 address, for example 192.168.1.20. Do not include http:// or a port.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final request = await client.getUrl(Uri.parse('http://$host:9099/emulator/v1/projects/demo-restaurant-attendance/config'));
      final response = await request.close().timeout(const Duration(seconds: 5));
      await response.drain<void>();
      if (response.statusCode != 200) throw const SocketException('Emulator not ready');
      await (await _settings()).writeAsString(host);
      await widget.onConnect(host);
    } catch (_) {
      if (mounted) setState(() => _error = 'Cannot connect. Start Docker Compose, wait for the backend to be healthy, and check that the phone and laptop share Wi-Fi. Allow Docker through the private-network firewall.');
    } finally {
      client.close(force: true);
      if (mounted) setState(() => _busy = false);
    }
  }
  @override
  void dispose() { _host.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Attendance Local Demo',
    home: Scaffold(appBar: AppBar(title: const Text('Local demo connection')),
      body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440), child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.dns_outlined, size: 56),
          const SizedBox(height: 16),
          const Text('Connect to the demo laptop. Location attendance runs locally; no Firebase billing or face recognition is needed.'),
          const SizedBox(height: 20),
          TextField(controller: _host, enabled: !_busy, keyboardType: TextInputType.url,
            decoration: const InputDecoration(labelText: 'Laptop Wi-Fi IPv4 address', hintText: '192.168.1.20'),
            onSubmitted: (_) { if (!_busy) _connect(); }),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(_error!, style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _connect, child: Text(_busy ? 'Connecting...' : 'Connect to local demo')),
          const SizedBox(height: 16),
          const Text('To change laptops later, fully close and reopen this demo app. Your last address is remembered.'),
        ]),
      ))),
    ),
  );
}
