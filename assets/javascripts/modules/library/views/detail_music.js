define([
    'app'
    , 'text!modules/library/templates/detail_music.html'
    , 'jwplayer'
],function(
    app
    , template
){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            var playlist = [{
                image: this.model.get('data_info').content.image.url_path
                , file:  this.model.get('data_info').content.file.url_path
                , title: this.model.get('data_info').content.title
                , type: this.model.get('data_info').content.file.type

            }];
            _.each(this.model.get('related_data'),function(play){
                playlist.push({
                    image: play.content.image.url_path,
                    file: play.content.file.url_path,
                    title: play.content.title
                });
            });
            this.player = jwplayer('music-player').setup({
                base: 'assets/player/'
                , height: 30
                , width: 580
                , autostart: true
                , primary: 'flash'
                , playlist: playlist
                , logo: {
                    hide: true
                }
            });
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});