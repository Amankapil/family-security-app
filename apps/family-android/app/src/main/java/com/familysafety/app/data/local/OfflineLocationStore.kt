package com.familysafety.app.data.local

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.familysafety.app.data.model.LocationFixPayload

/**
 * Resilient Offline Location SQLite FIFO Queue
 * Safely buffers GPS fixes during mobile dead zones (subways, underground parking, remote highways).
 */
class OfflineLocationStore(context: Context) : SQLiteOpenHelper(
    context,
    DATABASE_NAME,
    null,
    DATABASE_VERSION
) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE_LOCATIONS (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_LATITUDE REAL NOT NULL,
                $COL_LONGITUDE REAL NOT NULL,
                $COL_ACCURACY REAL NOT NULL,
                $COL_SPEED REAL NOT NULL,
                $COL_HEADING REAL NOT NULL,
                $COL_ALTITUDE REAL NOT NULL,
                $COL_BATTERY_LEVEL INTEGER,
                $COL_NETWORK_TYPE TEXT NOT NULL,
                $COL_TIMESTAMP TEXT NOT NULL,
                $COL_CREATED_AT INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_LOCATIONS")
        onCreate(db)
    }

    /**
     * Enqueue location fix when offline or when network upload fails
     */
    @Synchronized
    fun enqueue(fix: LocationFixPayload): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COL_LATITUDE, fix.latitude)
            put(COL_LONGITUDE, fix.longitude)
            put(COL_ACCURACY, fix.accuracy)
            put(COL_SPEED, fix.speed)
            put(COL_HEADING, fix.heading)
            put(COL_ALTITUDE, fix.altitude)
            put(COL_BATTERY_LEVEL, fix.batteryLevel)
            put(COL_NETWORK_TYPE, fix.networkType)
            put(COL_TIMESTAMP, fix.timestamp)
            put(COL_CREATED_AT, System.currentTimeMillis())
        }

        val insertId = db.insert(TABLE_LOCATIONS, null, values)
        trimQueue(MAX_QUEUE_CAPACITY)
        return insertId
    }

    /**
     * Fetch oldest buffered fixes up to batch limit (FIFO order)
     */
    @Synchronized
    fun getOldestBatch(limit: Int = 50): List<Pair<Long, LocationFixPayload>> {
        val list = mutableListOf<Pair<Long, LocationFixPayload>>()
        val db = readableDatabase

        val cursor = db.query(
            TABLE_LOCATIONS,
            null,
            null,
            null,
            null,
            null,
            "$COL_ID ASC",
            limit.toString()
        )

        cursor.use { c ->
            val idCol = c.getColumnIndexOrThrow(COL_ID)
            val latCol = c.getColumnIndexOrThrow(COL_LATITUDE)
            val lngCol = c.getColumnIndexOrThrow(COL_LONGITUDE)
            val accCol = c.getColumnIndexOrThrow(COL_ACCURACY)
            val spdCol = c.getColumnIndexOrThrow(COL_SPEED)
            val hdCol = c.getColumnIndexOrThrow(COL_HEADING)
            val altCol = c.getColumnIndexOrThrow(COL_ALTITUDE)
            val batCol = c.getColumnIndexOrThrow(COL_BATTERY_LEVEL)
            val netCol = c.getColumnIndexOrThrow(COL_NETWORK_TYPE)
            val tsCol = c.getColumnIndexOrThrow(COL_TIMESTAMP)

            while (c.moveToNext()) {
                val id = c.getLong(idCol)
                val fix = LocationFixPayload(
                    latitude = c.getDouble(latCol),
                    longitude = c.getDouble(lngCol),
                    accuracy = c.getFloat(accCol),
                    speed = c.getFloat(spdCol),
                    heading = c.getFloat(hdCol),
                    altitude = c.getDouble(altCol),
                    batteryLevel = if (c.isNull(batCol)) null else c.getInt(batCol),
                    networkType = c.getString(netCol),
                    timestamp = c.getString(tsCol)
                )
                list.add(Pair(id, fix))
            }
        }

        return list
    }

    /**
     * Delete successfully uploaded fixes from offline queue
     */
    @Synchronized
    fun deleteBatch(ids: List<Long>): Int {
        if (ids.isEmpty()) return 0
        val db = writableDatabase
        val idArgs = ids.joinToString(",") { it.toString() }
        return db.delete(TABLE_LOCATIONS, "$COL_ID IN ($idArgs)", null)
    }

    /**
     * Return count of pending offline records
     */
    @Synchronized
    fun getPendingCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_LOCATIONS", null)
        cursor.use {
            if (it.moveToFirst()) {
                return it.getInt(0)
            }
        }
        return 0
    }

    /**
     * Prevent unbounded storage growth by capping FIFO buffer
     */
    @Synchronized
    private fun trimQueue(maxCapacity: Int) {
        val count = getPendingCount()
        if (count > maxCapacity) {
            val toDelete = count - maxCapacity
            val db = writableDatabase
            db.execSQL(
                """
                DELETE FROM $TABLE_LOCATIONS 
                WHERE $COL_ID IN (
                    SELECT $COL_ID FROM $TABLE_LOCATIONS ORDER BY $COL_ID ASC LIMIT $toDelete
                )
                """.trimIndent()
            )
        }
    }

    companion object {
        private const val DATABASE_NAME = "family_safety_offline.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_LOCATIONS = "offline_locations"

        private const val COL_ID = "id"
        private const val COL_LATITUDE = "latitude"
        private const val COL_LONGITUDE = "longitude"
        private const val COL_ACCURACY = "accuracy"
        private const val COL_SPEED = "speed"
        private const val COL_HEADING = "heading"
        private const val COL_ALTITUDE = "altitude"
        private const val COL_BATTERY_LEVEL = "battery_level"
        private const val COL_NETWORK_TYPE = "network_type"
        private const val COL_TIMESTAMP = "timestamp"
        private const val COL_CREATED_AT = "created_at"

        const val MAX_QUEUE_CAPACITY = 5000
    }
}
