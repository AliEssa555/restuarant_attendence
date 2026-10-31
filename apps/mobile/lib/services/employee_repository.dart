import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/models.dart';

/// Live reads of the two documents the app cares about, plus the employee's own
/// attendance history.
///
/// Reads only. The security rules allow an employee to read their own employee
/// document and their own attendance records, and nothing else.
class EmployeeRepository {
  EmployeeRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _employeeRef(String rid, String eid) =>
      _db.collection('restaurants').doc(rid).collection('employees').doc(eid);

  /// The employee document. Watched rather than fetched, so a manager approving
  /// an enrolment unlocks the face button on the phone without a refresh.
  Stream<Employee?> watchEmployee(String rid, String eid) =>
      _employeeRef(rid, eid).snapshots().map(
            (snap) => snap.exists ? Employee.fromSnapshot(snap) : null,
          );

  Stream<Restaurant?> watchRestaurant(String rid) => _db
      .collection('restaurants')
      .doc(rid)
      .snapshots()
      .map((snap) => snap.exists ? Restaurant.fromSnapshot(snap) : null);

  Stream<AppUser?> watchUser(String uid) => _db
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) => snap.exists ? AppUser.fromSnapshot(snap) : null);

  /// The employee's own last [limit] records, newest first.
  ///
  /// Backed by the (employeeId, createdAt) composite index.
  Stream<List<AttendanceRecord>> watchMyHistory(
    String rid,
    String eid, {
    int limit = 30,
  }) =>
      _db
          .collection('restaurants')
          .doc(rid)
          .collection('attendance')
          .where('employeeId', isEqualTo: eid)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .snapshots()
          .map((snap) => snap.docs.map(AttendanceRecord.fromSnapshot).toList());
}
