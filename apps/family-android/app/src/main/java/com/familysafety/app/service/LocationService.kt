package com.familysafety.app.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.familysafety.app.FamilySafetyApp
import com.familysafety.app.data.local.OfflineLocationStore
import com.familysafety.app.data.model.LocationFixPayload
import com.familysafety.app.data.remote.ApiClient
import com.familysafety.app.ui.home.MainActivity
import com.familysafety.app.util.BatteryHelper
import com.familysafety.app.util.NetworkHelper
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*

class LocationService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val offlineStore by lazy { OfflineLocationStore(this) }
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var locationCallback: LocationCallback? = null

    private var currentIntervalMs: Long = INTERVAL_TRANSIT_MS
    private var lastUploadedLocation: Location? = null

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        setupLocationCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_START -> {
                startForegroundServiceNotification()
                requestAdaptiveLocationUpdates(INTERVAL_TRANSIT_MS)
            }
            ACTION_SET_MODE_STATIONARY -> {
                requestAdaptiveLocationUpdates(INTERVAL_STATIONARY_MS)
            }
            ACTION_SET_MODE_TRANSIT -> {
                requestAdaptiveLocationUpdates(INTERVAL_TRANSIT_MS)
            }
            ACTION_SET_MODE_SOS -> {
                requestAdaptiveLocationUpdates(INTERVAL_SOS_MS)
            }
            ACTION_STOP -> {
                stopSelf()
            }
        }

        return START_STICKY
    }

    private fun startForegroundServiceNotification() {
        val notification = buildServiceNotification("Protection active • Monitoring journey")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildServiceNotification(statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prefs = FamilySafetyApp.instance.preferencesManager
        val memberName = prefs.memberName ?: "Family Member"

        return NotificationCompat.Builder(this, FamilySafetyApp.CHANNEL_SERVICE)
            .setContentTitle("Family Safety: $memberName")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(statusText: String) {
        val notification = buildServiceNotification(statusText)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                processLocationFix(location)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun requestAdaptiveLocationUpdates(intervalMs: Long) {
        currentIntervalMs = intervalMs

        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            intervalMs
        ).apply {
            setMinUpdateIntervalMillis(intervalMs / 2)
            setMaxUpdateDelayMillis(intervalMs * 2)
            setMinUpdateDistanceMeters(if (intervalMs == INTERVAL_STATIONARY_MS) 20f else 5f)
        }.build()

        try {
            locationCallback?.let {
                fusedLocationClient.requestLocationUpdates(
                    locationRequest,
                    it,
                    Looper.getMainLooper()
                )
            }
        } catch (_: SecurityException) {
            // Handled via permission verification
        }
    }

    private fun processLocationFix(loc: Location) {
        // 1. Accuracy Filter: Drop fixes with accuracy > 65 meters
        if (loc.accuracy > 65f) {
            return
        }

        // 2. Speed Anomaly Filter: Drop impossible jumps (> 160 km/h = ~44.4 m/s)
        if (loc.speed > 44.4f) {
            return
        }

        // 3. Jump Anomaly Check with previous fix
        lastUploadedLocation?.let { prev ->
            val deltaTimeSec = (loc.time - prev.time) / 1000.0
            if (deltaTimeSec > 1.0) {
                val distanceMeters = loc.distanceTo(prev)
                val calculatedSpeedKmh = (distanceMeters / deltaTimeSec) * 3.6
                if (calculatedSpeedKmh > 180.0) {
                    return // Drop GPS teleportation artifact
                }
            }
        }

        lastUploadedLocation = loc

        // Dispatch fix to backend
        serviceScope.launch {
            val battery = BatteryHelper.getBatteryStatus(this@LocationService)
            val network = NetworkHelper.getNetworkType(this@LocationService)
            val isoTime = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date(loc.time))

            val payload = LocationFixPayload(
                latitude = loc.latitude,
                longitude = loc.longitude,
                accuracy = loc.accuracy,
                speed = loc.speed,
                heading = loc.bearing,
                altitude = loc.altitude,
                batteryLevel = battery.level,
                networkType = network,
                timestamp = isoTime
            )

            try {
                val res = ApiClient.service.uploadLocations(listOf(payload))
                if (res.isSuccessful) {
                    val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                    updateNotification("Protected • Synced at $timeStr • 🔋 ${battery.level}%")

                    // If previously buffered fixes exist in queue, trigger worker to flush them
                    if (offlineStore.getPendingCount() > 0) {
                        LocationSyncWorker.triggerImmediateSync(this@LocationService)
                    }
                } else {
                    // Non-200 response: buffer locally for resilient sync
                    offlineStore.enqueue(payload)
                    LocationSyncWorker.triggerImmediateSync(this@LocationService)
                }
            } catch (_: Exception) {
                // Mobile dead zone: buffer locally for resilient sync
                offlineStore.enqueue(payload)
                LocationSyncWorker.triggerImmediateSync(this@LocationService)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START_LOCATION_SERVICE"
        const val ACTION_STOP = "ACTION_STOP_LOCATION_SERVICE"
        const val ACTION_SET_MODE_STATIONARY = "ACTION_MODE_STATIONARY"
        const val ACTION_SET_MODE_TRANSIT = "ACTION_MODE_TRANSIT"
        const val ACTION_SET_MODE_SOS = "ACTION_MODE_SOS"

        // Adaptive intervals
        const val INTERVAL_TRANSIT_MS = 35_000L      // 35 seconds during movement
        const val INTERVAL_STATIONARY_MS = 300_000L  // 5 minutes inside known geofence
        const val INTERVAL_SOS_MS = 10_000L          // 10 seconds in emergency mode

        fun start(context: Context) {
            val intent = Intent(context, LocationService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, LocationService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
        }
    }
}
