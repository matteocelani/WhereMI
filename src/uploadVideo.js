/*
Copyright 2015 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var signinCallback = function (result){
  if(result.access_token) {
    var uploadVideo = new UploadVideo();
    uploadVideo.ready(result.access_token);
  }
};

var STATUS_POLLING_INTERVAL_MILLIS = 60 * 1000; // One minute.


/**
 * YouTube video uploader class
 *
 * @constructor
 */
var UploadVideo = function() {
  /**
   * The array of tags for the new YouTube video.
   *
   * @attribute tags
   * @type Array.<string>
   * @default ['google-cors-upload']
   */
  this.tags = ['youtube-cors-upload'];

  /**
   * The numeric YouTube
   * [category id](https://developers.google.com/apis-explorer/#p/youtube/v3/youtube.videoCategories.list?part=snippet®ionCode=us).
   *
   * @attribute categoryId
   * @type number
   * @default 22
   */
  this.categoryId = 22;

  /**
   * The id of the new video.
   *
   * @attribute videoId
   * @type string
   * @default ''
   */
  this.videoId = '';

  this.uploadStartTime = 0;
};

function generateDescription(){
  var descrizione;
  var lat = myPositionMarker.getLatLng().lat;
  var lng = myPositionMarker.getLatLng().lng;

  var olc = OpenLocationCode.encode(lat, lng);
  var olc1 = olc.substring(0, 6) + "00" + "+";  //BBBB0000 4 zeri+
  var olc2 = olc.substring(0, 9) ;    //BBBBFF00 2 zeri+
  var dati = $("#inputLocation").serializeArray();
  var lang = $("#formLanguage").val();
  var category = $('#formCategory').val();
  var pubblico = $('#formPublic').val();
  var descrizioneluogo = $('#descrizioneLuogo').val();

  descrizione = olc1 + "-" + olc2 + "-" + olc + ":" + dati[1].value + ":" + lang;

  if(category != null){
    descrizione += ":" + category;
  }

  if(pubblico != null){
    descrizione += ":" + pubblico;
  }

  if(dati[1].name === "Why"){
    descrizione += ":"+ $('#valoreDettaglio').val();
  } else {
    descrizione += ":" + ":";
  }

  if(descrizioneluogo != null){
    descrizione += "#"+ descrizioneluogo;
  }
  return descrizione;
}


UploadVideo.prototype.ready = function(accessToken) {
  this.accessToken = accessToken;
  this.gapi = gapi;
  this.authenticated = true;
  this.gapi.client.request({
    path: '/youtube/v3/channels',
    params: {
      part: 'snippet',
      mine: true
    },
    callback: function(response) {
      if (response.error) {
        console.log(response.error.message);
      }
    }.bind(this)
  });
  $('#addPlaceAction').on("click", this.handleUploadClicked.bind(this));
};

/**
 * Uploads a video file to YouTube.
 *
 * @method uploadFile
 * @param {object} file File object corresponding to the video to upload.
 */

UploadVideo.prototype.uploadFile = function(file) {
  var descrizione = generateDescription();
  var metadata = {
    snippet: {
      title: $('#nomeLuogo').val(),
      description: descrizione,
      tags: this.tags,
      categoryId: this.categoryId
    },
    status: {
      privacyStatus: 'public'
    }
  };
  var uploader = new MediaUploader({
    baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
    file: file,
    token: this.accessToken,
    metadata: metadata,
    params: {
      part: Object.keys(metadata).join(',')
    },
    onError: function(data) {
      var message = data;
      // Assuming the error is raised by the YouTube API, data will be
      // a JSON string with error.message set. That may not be the
      // only time onError will be raised, though.
      try {
        var errorResponse = JSON.parse(data);
        message = errorResponse.error.message;
      } finally {
        console.log('errore');
      }
    }.bind(this),
    onProgress: function(data) {
      var currentTime = Date.now();
      var bytesUploaded = data.loaded;
      var totalBytes = data.total;
      // The times are in millis, so we need to divide by 1000 to get seconds.
      var bytesPerSecond = bytesUploaded / ((currentTime - this.uploadStartTime) / 1000);
      var estimatedSecondsRemaining = (totalBytes - bytesUploaded) / bytesPerSecond;
      var percentageComplete = (bytesUploaded * 100) / totalBytes;

      $('#upload-progress').attr({
        value: bytesUploaded,
        max: totalBytes
      });

      $('#percent-transferred').text(percentageComplete);
      $('#bytes-transferred').text(bytesUploaded);
      $('#total-bytes').text(totalBytes);

      $('.during-upload').show();
    }.bind(this),
    onComplete: function(data) {
      var uploadResponse = JSON.parse(data);
      this.videoId = uploadResponse.id;
      $('#video-id').text(this.videoId);
      $('.post-upload').show();
      this.pollForVideoStatus();
    }.bind(this)
  });
  // This won't correspond to the *exact* start of the upload, but it should be close enough.
  this.uploadStartTime = Date.now();
  uploader.upload();
  updateCookie(profile.getEmail());
};

UploadVideo.prototype.handleUploadClicked = function() {
  if(validateForm()){
    $('#addPlaceAction').attr('data-toggle', 'modal');
    $('#addPlaceAction').attr('data-target', '#statusUpload');
    if(exportBlobs != undefined){
      const videoToUpload = new Blob(exportBlobs, {type: 'video/mp4'});
      this.uploadFile(videoToUpload);
      $('#file').get(0).files[0] = undefined;

    }else if($('#file').get(0).files[0] != undefined){
      this.uploadFile($('#file').get(0).files[0]);
    }
  }
}

UploadVideo.prototype.pollForVideoStatus = function() {
  this.gapi.client.request({
    path: '/youtube/v3/videos',
    params: {
      part: 'status,player',
      id: this.videoId
    },
    callback: function(response) {
      if (response.error) {
        // The status polling failed.
        console.log(response.error.message);
        setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
      } else {
        var uploadStatus = response.items[0].status.uploadStatus;
        switch (uploadStatus) {
          // This is a non-final status, so we need to poll again.
          case 'uploaded':
            $('#post-upload-status').append('<li>Upload status: ' + uploadStatus + '</li>');
            setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
            break;
          // The video was successfully transcoded and is available.
          case 'processed':
            $('#player').append(response.items[0].player.embedHtml);
            $('#post-upload-status').append('<li>Final status.</li>');
            break;
          // All other statuses indicate a permanent transcoding failure.
          default:
            $('#post-upload-status').append('<li>Transcoding failed.</li>');
            break;
        }
      }
    }.bind(this)
  });
};
