package com.familysafety.app.ui.pairing

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.familysafety.app.FamilySafetyApp
import com.familysafety.app.data.model.CompletePairingRequest
import com.familysafety.app.data.remote.ApiClient
import com.familysafety.app.databinding.ActivityPairingBinding
import com.familysafety.app.ui.home.MainActivity
import com.familysafety.app.util.PermissionHelper
import kotlinx.coroutines.launch

class PairingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPairingBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPairingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnConnect.setOnClickListener {
            val code = binding.etPairingCode.text?.toString()?.trim()
            if (code.isNullOrEmpty()) {
                binding.tilPairingCode.error = "Please enter the pairing code from dashboard"
                return@setOnClickListener
            }
            binding.tilPairingCode.error = null
            submitPairing(code)
        }
    }

    private fun submitPairing(pairingToken: String) {
        val prefs = FamilySafetyApp.instance.preferencesManager

        binding.progressBar.visibility = View.VISIBLE
        binding.btnConnect.isEnabled = false

        lifecycleScope.launch {
            try {
                val request = CompletePairingRequest(
                    pairingToken = pairingToken,
                    deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
                    manufacturer = Build.MANUFACTURER,
                    model = Build.MODEL,
                    androidVersion = Build.VERSION.RELEASE,
                    appVersion = "1.0.0",
                    fcmToken = null,
                    permissions = PermissionHelper.getPermissionsPayload(this@PairingActivity)
                )

                val response = ApiClient.service.completePairing(request)

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null) {
                        prefs.savePairingSession(
                            deviceId = data.deviceId,
                            deviceToken = data.deviceToken,
                            memberId = data.member.id,
                            memberName = data.member.displayName,
                            familyId = data.family.id,
                            familyName = data.family.name
                        )

                        Toast.makeText(
                            this@PairingActivity,
                            "Paired as ${data.member.displayName} in ${data.family.name}!",
                            Toast.LENGTH_LONG
                        ).show()

                        startActivity(Intent(this@PairingActivity, MainActivity::class.java))
                        finish()
                    }
                } else {
                    val err = response.body()?.error ?: "Pairing failed. Please check the code."
                    Toast.makeText(this@PairingActivity, err, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@PairingActivity,
                    "Connection error: ${e.localizedMessage ?: "Unable to reach server"}",
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.btnConnect.isEnabled = true
            }
        }
    }
}
