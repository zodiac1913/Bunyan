//! Windows re-authentication for saved-password access using installed credential providers.

use anyhow::{Result, bail, ensure};
use std::{
    ffi::c_void,
    mem::size_of,
    ptr::{null, null_mut},
    slice,
    sync::atomic::{Ordering, compiler_fence},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, ERROR_CANCELLED, HANDLE},
    Security::{
        AllocateLocallyUniqueId, GetLengthSid, GetTokenInformation, TOKEN_QUERY, TOKEN_SOURCE,
        TOKEN_USER, TokenUser,
    },
    Security::{Authentication::Identity::*, Credentials::*},
    System::{
        Com::CoTaskMemFree,
        Threading::{GetCurrentProcess, OpenProcessToken},
        WindowsProgramming::GetUserNameW,
    },
};

/// Verify this process's Windows account before Bunyan reads a saved SQL password.
pub(crate) fn reauthenticate() -> Result<()> {
    let caption = wide("Bunyan sign-in");
    let message = wide("Verify your Windows identity to use the saved SQL Server password.");
    let ui = CREDUI_INFOW {
        cbSize: size_of::<CREDUI_INFOW>() as u32,
        hwndParent: null_mut(),
        pszMessageText: message.as_ptr(),
        pszCaptionText: caption.as_ptr(),
        hbmBanner: null_mut(),
    };
    let packed_credentials = current_user_credentials()?;
    let mut auth_package = 0;
    let mut auth_blob = null_mut();
    let mut auth_blob_size = 0;
    // Keep the provider dialog on the normal desktop instead of blanking the screen.
    let prompt_status = unsafe {
        CredUIPromptForWindowsCredentialsW(
            &ui,
            0,
            &mut auth_package,
            packed_credentials.as_ptr().cast(),
            packed_credentials.len() as u32,
            &mut auth_blob,
            &mut auth_blob_size,
            null_mut(),
            0,
        )
    };
    let auth_blob = SecureAuthBuffer {
        pointer: auth_blob,
        length: auth_blob_size,
    };
    if prompt_status == ERROR_CANCELLED {
        bail!("Windows sign-in was canceled; the saved SQL password was not read.");
    }
    ensure!(prompt_status == 0, "Windows sign-in prompt failed.");
    ensure!(
        !auth_blob.pointer.is_null() && auth_blob.length > 0,
        "Windows returned no sign-in credentials."
    );

    let mut lsa_handle: HANDLE = null_mut();
    let status = unsafe { LsaConnectUntrusted(&mut lsa_handle) };
    ensure!(
        status == 0,
        "Windows could not start credential verification."
    );
    let _lsa = LsaSession(lsa_handle);

    let mut source = TOKEN_SOURCE {
        SourceName: [
            b'B' as i8, b'u' as i8, b'n' as i8, b'y' as i8, b'a' as i8, b'n' as i8, b' ' as i8,
            b' ' as i8,
        ],
        ..Default::default()
    };
    ensure!(
        unsafe { AllocateLocallyUniqueId(&mut source.SourceIdentifier) } != 0,
        "Windows could not initialize credential verification."
    );
    let origin_bytes = b"Bunyan";
    let origin = LSA_STRING {
        Length: origin_bytes.len() as u16,
        MaximumLength: origin_bytes.len() as u16,
        Buffer: origin_bytes.as_ptr() as *mut u8,
    };
    let mut profile = null_mut();
    let mut profile_length = 0;
    let mut logon_id = Default::default();
    let mut token: HANDLE = null_mut();
    let mut quotas = Default::default();
    let mut substatus = 0;
    let status = unsafe {
        LsaLogonUser(
            lsa_handle,
            &origin,
            SECURITY_LOGON_TYPE::Interactive,
            auth_package,
            auth_blob.pointer,
            auth_blob.length,
            null(),
            &source,
            &mut profile,
            &mut profile_length,
            &mut logon_id,
            &mut token,
            &mut quotas,
            &mut substatus,
        )
    };
    let _profile = LsaProfile(profile);
    let verified_token = TokenHandle(token);
    ensure!(status == 0, "Windows did not verify your sign-in.");

    let mut current_token = null_mut();
    ensure!(
        unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut current_token) } != 0,
        "Could not verify the current Windows account."
    );
    let current_token = TokenHandle(current_token);
    ensure!(
        token_user_sid(current_token.0)? == token_user_sid(verified_token.0)?,
        "Use the Windows account currently running Bunyan."
    );
    Ok(())
}

fn current_user_credentials() -> Result<Vec<u8>> {
    let mut username = [0u16; 1024];
    let mut username_length = username.len() as u32;
    ensure!(
        unsafe { GetUserNameW(username.as_mut_ptr(), &mut username_length) } != 0,
        "Could not identify the current Windows account."
    );
    ensure!(
        username_length > 1,
        "Windows returned an empty account name."
    );
    let password = [0u16];
    let mut packed_length = 0;
    unsafe {
        CredPackAuthenticationBufferW(
            0,
            username.as_ptr(),
            password.as_ptr(),
            null_mut(),
            &mut packed_length,
        )
    };
    ensure!(packed_length > 0, "Could not prepare Windows sign-in.");
    let mut packed = vec![0u8; packed_length as usize];
    ensure!(
        unsafe {
            CredPackAuthenticationBufferW(
                0,
                username.as_ptr(),
                password.as_ptr(),
                packed.as_mut_ptr(),
                &mut packed_length,
            )
        } != 0,
        "Could not prepare Windows sign-in."
    );
    packed.truncate(packed_length as usize);
    Ok(packed)
}

fn token_user_sid(token: HANDLE) -> Result<Vec<u8>> {
    let mut required = 0;
    unsafe { GetTokenInformation(token, TokenUser, null_mut(), 0, &mut required) };
    ensure!(required > 0, "Could not read Windows account identity.");
    let words = (required as usize).div_ceil(size_of::<usize>());
    let mut storage = vec![0usize; words];
    ensure!(
        unsafe {
            GetTokenInformation(
                token,
                TokenUser,
                storage.as_mut_ptr().cast(),
                required,
                &mut required,
            )
        } != 0,
        "Could not read Windows account identity."
    );
    let user = unsafe { &*storage.as_ptr().cast::<TOKEN_USER>() };
    ensure!(
        !user.User.Sid.is_null(),
        "Windows returned no account identity."
    );
    let sid_length = unsafe { GetLengthSid(user.User.Sid) } as usize;
    ensure!(
        sid_length > 0,
        "Windows returned an invalid account identity."
    );
    Ok(unsafe { slice::from_raw_parts(user.User.Sid.cast::<u8>(), sid_length) }.to_vec())
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

struct SecureAuthBuffer {
    pointer: *mut c_void,
    length: u32,
}

impl Drop for SecureAuthBuffer {
    fn drop(&mut self) {
        if self.pointer.is_null() {
            return;
        }
        for offset in 0..self.length as usize {
            unsafe { self.pointer.cast::<u8>().add(offset).write_volatile(0) };
        }
        compiler_fence(Ordering::SeqCst);
        unsafe { CoTaskMemFree(self.pointer) };
    }
}

struct LsaSession(HANDLE);

impl Drop for LsaSession {
    fn drop(&mut self) {
        unsafe { LsaClose(self.0 as isize) };
    }
}

struct LsaProfile(*mut c_void);

impl Drop for LsaProfile {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { LsaFreeReturnBuffer(self.0) };
        }
    }
}

struct TokenHandle(HANDLE);

impl Drop for TokenHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CloseHandle(self.0) };
        }
    }
}
