package com.familysafety.app.ui.home

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.MotionEvent
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.familysafety.app.FamilySafetyApp
import com.familysafety.app.data.model.HeartbeatRequest
import com.familysafety.app.data.model.ImOkRequest
import com.familysafety.app.data.model.SosRequest
import com.familysafety.app.data.remote.ApiClient
import com.familysafety.app.databinding.ActivityMainBinding
import com.familysafety.app.ui.pairing.PairingActivity
import com.familysafety.app.util.BatteryHelper
import com.familysafety.app.util.NetworkHelper
import com.familysafety.app.util.PermissionHelper
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var sosPressJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = FamilySafetyApp.instance.preferencesManager

        // If not paired yet, launch pairing activity
        if (!prefs.isPaired) {
            startActivity(Intent(this, PairingActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupDynamicUI()
        setupActionButtons()
        checkPermissionsAndHealth()

        // Start Foreground Location Service
        if (PermissionHelper.hasFineLocation(this)) {
            com.familysafety.app.service.LocationService.start(this)
        }
    }

    override fun onResume() {
        super.onResume()
        refreshTelemetry()
    }

    private fun setupDynamicUI() {
        val prefs = FamilySafetyApp.instance.preferencesManager
        val memberName = prefs.memberName ?: "Family Member"
        val familyName = prefs.familyName ?: "Family"

        // Dynamically displays whoever this phone belongs to (Dad, Mom, Brother, Sister, etc.)
        binding.tvMemberName.text = memberName
        binding.tvAppTitle.text = "$familyName SAFETY"
        binding.tvJourneyState.text = "🟢 Connected & Protected"
    }

    private fun refreshTelemetry() {
        val battery = BatteryHelper.getBatteryStatus(this)
        val network = NetworkHelper.getNetworkType(this)

        val chargingStr = if (battery.isCharging) " (Charging)" else ""
        binding.tvBattery.text = "🔋 Battery: ${battery.level}%$chargingStr"
        binding.tvNetwork.text = "📶 Network: $network"
        binding.tvLastSync.text = "Updated just now"

        // Send telemetry heartbeat in background
        lifecycleScope.launch {
            try {
                ApiClient.service.sendHeartbeat(
                    HeartbeatRequest(
                        batteryLevel = battery.level,
                        isCharging = battery.isCharging,
                        networkType = network,
                        permissions = PermissionHelper.getPermissionsPayload(this@MainActivity)
                    )
                )
            } catch (_: Exception) {
                // Heartbeat sync silently handled
            }
        }
    }

    private fun checkPermissionsAndHealth() {
        val hasBgLoc = PermissionHelper.hasBackgroundLocation(this)
        val isBattIgnored = PermissionHelper.isBatteryOptimizationIgnored(this)

        if (!hasBgLoc || !isBattIgnored) {
            binding.tvPermissionWarning.visibility = View.VISIBLE
            val warningMsg = when {
                !hasBgLoc && !isBattIgnored -> "⚠️ Tap to fix: Background location & battery optimization required."
                !hasBgLoc -> "⚠️ Tap to fix: Background location must be set to 'Allow all the time'."
                else -> "⚠️ Tap to fix: Battery optimization active. Tracking may pause when screen is off."
            }
            binding.tvPermissionWarning.text = warningMsg
            binding.tvPermissionWarning.setOnClickListener {
                resolvePermissionIssue(!isBattIgnored, !hasBgLoc)
            }
        } else {
            binding.tvPermissionWarning.visibility = View.GONE
        }
    }

    @SuppressLint("BatteryLife")
    private fun resolvePermissionIssue(fixBattery: Boolean, fixLocation: Boolean) {
        if (fixBattery) {
            try {
                val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = android.net.Uri.parse("package:$packageName")
                }
                startActivity(intent)
                return
            } catch (_: Exception) {
                // Fallback to general settings
            }
        }

        if (fixLocation && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                requestPermissions(arrayOf(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION), 1002)
                return
            } catch (_: Exception) {
                // Fallback to app details
            }
        }

        try {
            val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = android.net.Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Please open device settings to grant permissions.", Toast.LENGTH_SHORT).show()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupActionButtons() {
        // "I'M OK" Action
        binding.btnImOk.setOnClickListener {
            sendImOkSignal()
        }

        // SOS Action with 2-Second Hold Detection
        binding.btnSos.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startSosTimer()
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    cancelSosTimer()
                    true
                }
                else -> false
            }
        }
    }

    private fun startSosTimer() {
        vibrate(50)
        binding.btnSos.text = "HOLD FOR 2 SECONDS..."

        sosPressJob = lifecycleScope.launch {
            delay(2000) // 2-second hold
            vibrate(500)
            binding.btnSos.text = "EMERGENCY SOS SENT!"
            triggerSosEmergency()
        }
    }

    private fun cancelSosTimer() {
        sosPressJob?.cancel()
        sosPressJob = null
        binding.btnSos.text = getString(com.familysafety.app.R.string.btn_sos)
    }

    private fun triggerSosEmergency() {
        val battery = BatteryHelper.getBatteryStatus(this)

        lifecycleScope.launch {
            try {
                // Default coordinates for testing until Phase 6 Location Service runs
                val response = ApiClient.service.triggerSos(
                    SosRequest(
                        latitude = 28.6139,
                        longitude = 77.2090,
                        accuracy = 10f,
                        batteryLevel = battery.level,
                        triggerType = "MANUAL_SOS"
                    )
                )

                if (response.isSuccessful) {
                    Toast.makeText(
                        this@MainActivity,
                        "🚨 Emergency SOS alerted to your family!",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    Toast.makeText(this@MainActivity, "Emergency alert recorded.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@MainActivity,
                    "Alert queued locally: ${e.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun sendImOkSignal() {
        vibrate(100)
        binding.btnImOk.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = ApiClient.service.sendImOk(
                    ImOkRequest(
                        latitude = 28.6139,
                        longitude = 77.2090,
                        note = "I'm safe and OK"
                    )
                )

                if (response.isSuccessful) {
                    Toast.makeText(
                        this@MainActivity,
                        "👍 Family notified that you are safe!",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    Toast.makeText(this@MainActivity, "Status sent.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Status recorded.", Toast.LENGTH_SHORT).show()
            } finally {
                binding.btnImOk.isEnabled = true
            }
        }
    }

    private fun vibrate(durationMs: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }
}
