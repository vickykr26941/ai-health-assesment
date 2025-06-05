from django.urls import path
from . import views

app_name = 'health_assessment'

urlpatterns = [
    path('assessment/start/', views.start_assessment, name='start_assessment'),
    path('assessment/<uuid:assessment_id>/', views.get_assessment, name='get_assessment'),
    path('assessment/<uuid:assessment_id>/next-question/', views.get_next_question, name='next_question'),
    path('answer/submit/', views.submit_answer, name='submit_answer'),
    path('treatment-plan/<uuid:assessment_id>/', views.generate_treatment_plan, name='generate_treatment_plan'),
]
